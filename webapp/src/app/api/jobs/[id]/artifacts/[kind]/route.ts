const API = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const { id, kind } = await params;
  const upstream = await fetch(
    `${API}/api/jobs/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(kind)}`,
    { cache: "no-store" }
  );

  const headers = new Headers();
  for (const name of ["content-type", "content-disposition", "content-length"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
