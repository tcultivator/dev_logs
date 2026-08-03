import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/models";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Database error. Is MySQL running and .env correct?" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const description = body.description
      ? String(body.description).trim()
      : null;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const project = await createProject(name, description);
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error(error);
    const message = String(error);
    if (message.includes("Duplicate") || message.includes("ER_DUP_ENTRY")) {
      return NextResponse.json(
        { error: "Project name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Database error while creating project" },
      { status: 500 }
    );
  }
}
