import { NextResponse, type NextRequest } from "next/server";

import { LibraryService } from "@/core/library/libraryService.js";

import { db, handleRoute, requireUser } from "../_lib/http.js";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    return NextResponse.json(new LibraryService(database).getBundle(user.id));
  });
}
