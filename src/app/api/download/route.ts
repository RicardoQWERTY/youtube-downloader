import { NextRequest, NextResponse } from "next/server";
import { downloadVideo } from "@/lib/ytdlp";

export const maxDuration = 300; // 5 minutes timeout

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get("url");
  const formatId = searchParams.get("formatId");
  const type = searchParams.get("type") as "video" | "audio" | null;

  if (!url || !formatId) {
    return NextResponse.json(
      { error: "URL and formatId parameters are required" },
      { status: 400 }
    );
  }

  try {
    const isAudioOnly = type === "audio";
    const { data, filename } = await downloadVideo(url, formatId, isAudioOnly);

    const headers: HeadersInit = {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Type": isAudioOnly ? "audio/mp4" : "video/mp4",
      "Content-Length": data.length.toString(),
    };

    return new NextResponse(new Uint8Array(data), { headers });
  } catch (error) {
    console.error("Error downloading video:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Categorize errors for better user feedback
    if (errorMessage.includes("timed out")) {
      return NextResponse.json(
        { error: "Download timed out. The video may be too large." },
        { status: 504 }
      );
    }
    if (errorMessage.includes("format") || errorMessage.includes("Format")) {
      return NextResponse.json(
        { error: "The selected format is not available for this video." },
        { status: 400 }
      );
    }
    if (errorMessage.includes("Video unavailable") || errorMessage.includes("Private video")) {
      return NextResponse.json(
        { error: "This video is unavailable or private." },
        { status: 404 }
      );
    }
    if (errorMessage.includes("geo") || errorMessage.includes("country")) {
      return NextResponse.json(
        { error: "This video is not available in your region." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to download video. Please try again or select a different format." },
      { status: 500 }
    );
  }
}
