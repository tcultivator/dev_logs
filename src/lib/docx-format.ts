import JSZip from "jszip";
import {
  BUILTIN_FORMAT,
  BUILTIN_LAYOUT,
  ReportAlign,
  ReportFormatInput,
} from "@/lib/report-format";

type StyledParagraph = {
  text: string;
  font?: string;
  size?: number;
  bold: boolean;
  underline: boolean;
  list: boolean;
  align?: string;
  left?: number;
  hanging?: number;
  line?: number;
};

const SYMBOL_FONTS = new Set(["wingdings", "wingdings 2", "wingdings 3", "symbol", "webdings"]);

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)));
}

function flag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<w:${tag}\\b([^>]*)\\/?>`));
  if (!match) return false;
  const off = /w:val="(?:0|false|none)"/.test(match[1] || "");
  return !off;
}

function paragraphs(xml: string): StyledParagraph[] {
  return xml
    .split(/<w:p[\s>]/)
    .slice(1)
    .map((chunk) => {
      const end = chunk.indexOf("</w:p>");
      const body = end >= 0 ? chunk.slice(0, end) : chunk;
      const text = [...body.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
        .map((match) => decodeXml(match[1]))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      const pPr = body.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] || "";
      const font = body.match(/w:ascii="([^"]+)"/)?.[1];
      const size = body.match(/<w:sz\b[^>]*w:val="(\d+)"/)?.[1];
      const left = pPr.match(/w:left="(\d+)"/)?.[1];
      const hanging = pPr.match(/w:hanging="(\d+)"/)?.[1];
      const line = pPr.match(/w:line="(\d+)"/)?.[1];
      return {
        text,
        font,
        size: size ? Number(size) / 2 : undefined,
        bold: flag(body, "b"),
        underline: flag(body, "u"),
        list: /<w:numPr>/.test(body),
        align: pPr.match(/<w:jc\b[^>]*w:val="([^"]+)"/)?.[1],
        left: left ? Number(left) : undefined,
        hanging: hanging ? Number(hanging) : undefined,
        line: line ? Number(line) : undefined,
      };
    })
    .filter((paragraph) => paragraph.text);
}

function plainBullet(value: string | undefined) {
  const cleaned = (value || "")
    .replace(/[\u0000-\u001F\uE000-\uF8FF]/g, "")
    .trim()
    .slice(0, 3);
  return cleaned || "•";
}

function bulletFromNumbering(xml: string | undefined) {
  if (!xml) return "•";
  const levels = xml.match(/<w:lvl\b[\s\S]*?<\/w:lvl>/g) || [];
  const level = levels.find((item) => /<w:numFmt\b[^>]*w:val="bullet"/.test(item));
  if (!level) return "•";
  const font = level.match(/w:ascii="([^"]+)"/)?.[1] || "";
  const text = decodeXml(level.match(/<w:lvlText\b[^>]*w:val="([^"]*)"/)?.[1] || "");
  if (SYMBOL_FONTS.has(font.toLowerCase())) return "•";
  return plainBullet(text);
}

function stripMarker(value: string) {
  return value
    .replace(/^[\s\uE000-\uF8FF•·∙●○■□▪▫►▶▸‣\-–—*✓✔]+/, "")
    .trim();
}

function usableFont(font: string | undefined, fallback: string) {
  if (!font || SYMBOL_FONTS.has(font.toLowerCase())) return fallback;
  return font;
}

function mapAlign(value: string | undefined, fallback: ReportAlign): ReportAlign {
  if (value === "center") return "center";
  if (value === "right" || value === "end") return "right";
  if (value === "both" || value === "justify" || value === "distribute") return "both";
  if (value === "left" || value === "start") return "left";
  return fallback;
}

function pageSetup(xml: string) {
  const sect = [...xml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)].pop()?.[0] || "";
  const size = sect.match(/<w:pgSz\b[^>]*>/)?.[0] || "";
  const margin = sect.match(/<w:pgMar\b[^>]*>/)?.[0] || "";
  const read = (block: string, name: string) => {
    const value = block.match(new RegExp(`w:${name}="(\\d+)"`))?.[1];
    return value ? Number(value) : undefined;
  };
  return {
    pageWidth: read(size, "w"),
    pageHeight: read(size, "h"),
    marginTop: read(margin, "top"),
    marginRight: read(margin, "right"),
    marginBottom: read(margin, "bottom"),
    marginLeft: read(margin, "left"),
    header: read(margin, "header"),
    footer: read(margin, "footer"),
  };
}

function bulletIndent(xml: string | undefined) {
  if (!xml) return {};
  const levels = xml.match(/<w:lvl\b[\s\S]*?<\/w:lvl>/g) || [];
  const level = levels.find((item) => /<w:numFmt\b[^>]*w:val="bullet"/.test(item));
  if (!level) return {};
  const left = level.match(/w:left="(\d+)"/)?.[1];
  const hanging = level.match(/w:hanging="(\d+)"/)?.[1];
  return {
    left: left ? Number(left) : undefined,
    hanging: hanging ? Number(hanging) : undefined,
  };
}

function fileTitle(filename: string) {
  const name = filename.replace(/\.docx$/i, "").replace(/\s+/g, " ").trim();
  return name.slice(0, 80) || "Uploaded format";
}

export async function extractFormatFromDocx(
  data: ArrayBuffer | Uint8Array,
  filename: string
): Promise<ReportFormatInput> {
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("That file is not a Word document.");
  }

  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("That file is not a Word document.");

  const headerName = Object.keys(zip.files)
    .filter((name) => /^word\/header\d+\.xml$/.test(name))
    .sort()[0];
  const headerXml = headerName ? await zip.file(headerName)?.async("string") : undefined;
  const numberingXml = await zip.file("word/numbering.xml")?.async("string");

  const header = headerXml ? paragraphs(headerXml) : [];
  const body = paragraphs(documentXml);
  const accomplishments =
    body.find(
      (paragraph) =>
        paragraph.bold &&
        paragraph.underline &&
        /accomplishment/i.test(paragraph.text)
    ) || body.find((paragraph) => paragraph.bold && paragraph.underline);

  const bodyFont = usableFont(
    accomplishments?.font || body.find((paragraph) => paragraph.font)?.font,
    BUILTIN_FORMAT.bodyFont
  );
  const bodySize = accomplishments?.size || body.find((paragraph) => paragraph.size)?.size;

  const notes = [];
  const seen = new Set<string>();
  const accomplishmentIndex = accomplishments ? body.indexOf(accomplishments) : -1;
  const start = accomplishmentIndex >= 0 ? accomplishmentIndex + 1 : 0;
  const after = body.slice(start);
  const nameParagraph = accomplishmentIndex > 0 ? body[accomplishmentIndex - 1] : undefined;
  const name =
    nameParagraph && nameParagraph.text.length <= 80 && !nameParagraph.underline
      ? nameParagraph
      : undefined;
  const project = after.find(
    (paragraph) => !paragraph.list && paragraph.text.length <= 80 && !paragraph.text.includes(":")
  );
  const bulletParagraph = after.find((paragraph) => paragraph.list && paragraph.hanging);
  const indent = bulletIndent(numberingXml);
  const page = pageSetup(documentXml);
  const base = BUILTIN_LAYOUT;
  let noteSample: StyledParagraph | undefined;

  for (let index = start; index < body.length && notes.length < 8; index += 1) {
    const paragraph = body[index];
    const heading =
      paragraph.bold &&
      !paragraph.underline &&
      paragraph.text.length <= 80 &&
      paragraph.text.includes(":");
    if (!heading) continue;
    const key = paragraph.text.toLowerCase();
    if (seen.has(key)) break;
    seen.add(key);
    if (!noteSample) noteSample = paragraph;
    const next = body[index + 1];
    const value = next && !next.bold ? stripMarker(next.text) : "";
    notes.push({
      heading: paragraph.text,
      value: value || "Not specified.",
    });
  }

  return {
    name: fileTitle(filename),
    headerTitle: header[0]?.text || BUILTIN_FORMAT.headerTitle,
    headerFont: usableFont(header[0]?.font, BUILTIN_FORMAT.headerFont),
    headerTitleSize: header[0]?.size || BUILTIN_FORMAT.headerTitleSize,
    headerDateSize: header[1]?.size || BUILTIN_FORMAT.headerDateSize,
    bodyFont,
    bodySize: bodySize || BUILTIN_FORMAT.bodySize,
    bullet: bulletFromNumbering(numberingXml),
    accomplishmentsLabel: accomplishments?.text || BUILTIN_FORMAT.accomplishmentsLabel,
    notes: notes.length ? notes : BUILTIN_FORMAT.notes.map((note) => ({ ...note })),
    layout: {
      pageWidth: page.pageWidth ?? base.pageWidth,
      pageHeight: page.pageHeight ?? base.pageHeight,
      marginTop: page.marginTop ?? base.marginTop,
      marginRight: page.marginRight ?? base.marginRight,
      marginBottom: page.marginBottom ?? base.marginBottom,
      marginLeft: page.marginLeft ?? base.marginLeft,
      header: page.header ?? base.header,
      footer: page.footer ?? base.footer,
      headerAlign: mapAlign(header[0]?.align, base.headerAlign),
      headerBold: header[0]?.bold ?? base.headerBold,
      nameAlign: mapAlign(name?.align, base.nameAlign),
      nameBold: name?.bold ?? base.nameBold,
      accomplishmentsAlign: mapAlign(accomplishments?.align, base.accomplishmentsAlign),
      accomplishmentsBold: accomplishments?.bold ?? base.accomplishmentsBold,
      accomplishmentsUnderline: accomplishments?.underline ?? base.accomplishmentsUnderline,
      projectAlign: mapAlign(project?.align, base.projectAlign),
      projectBold: project?.bold ?? base.projectBold,
      noteAlign: mapAlign(noteSample?.align, base.noteAlign),
      noteBold: noteSample?.bold ?? base.noteBold,
      bulletLeft: bulletParagraph?.left ?? indent.left ?? base.bulletLeft,
      bulletHanging: bulletParagraph?.hanging ?? indent.hanging ?? base.bulletHanging,
      line: accomplishments?.line ?? bulletParagraph?.line ?? base.line,
    },
  };
}
