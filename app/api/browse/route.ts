import { NextResponse } from "next/server";
import {
  BROWSE_PAGE_SIZE,
  fetchBrowsePage,
  parseBrowseParams,
} from "@/lib/browse-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { kind, sort, section, page } = parseBrowseParams({
    kind: searchParams.get("kind") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    section: searchParams.get("section") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });

  const result = await fetchBrowsePage({
    kind,
    sort,
    section,
    page,
    pageSize: BROWSE_PAGE_SIZE,
  });

  return NextResponse.json(result);
}
