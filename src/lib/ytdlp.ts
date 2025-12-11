import { spawn } from "child_process";
import type { VideoInfo, VideoFormat } from "@/types/video";
import { sanitizeFilename } from "@/lib/utils";

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function spawnAsync(
  command: string,
  args: string[],
  options?: { timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const timeout = options?.timeout ?? TIMEOUT_MS;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Process timed out after ${timeout / 1000} seconds`));
    }, timeout);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({
          stdout: Buffer.concat(stdout).toString(),
          stderr: Buffer.concat(stderr).toString(),
        });
      } else {
        reject(
          new Error(
            `Process exited with code ${code}: ${Buffer.concat(stderr).toString()}`
          )
        );
      }
    });
  });
}

interface YtDlpFormat {
  format_id: string;
  ext: string;
  resolution?: string;
  height?: number;
  width?: number;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  abr?: number;
  vcodec?: string;
  acodec?: string;
  fps?: number;
  format_note?: string;
}

interface YtDlpOutput {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  view_count: number;
  formats: YtDlpFormat[];
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function parseFormats(formats: YtDlpFormat[]): {
  videoFormats: VideoFormat[];
  audioFormats: VideoFormat[];
} {
  const videoFormats: VideoFormat[] = [];
  const audioFormats: VideoFormat[] = [];
  const seenResolutions = new Set<string>();
  const seenBitrates = new Set<number>();

  // Sort by quality (higher first)
  const sortedFormats = [...formats].sort((a, b) => {
    const aHeight = a.height || 0;
    const bHeight = b.height || 0;
    return bHeight - aHeight;
  });

  for (const format of sortedFormats) {
    const hasVideo = format.vcodec && format.vcodec !== "none";
    const hasAudio = format.acodec && format.acodec !== "none";

    if (hasVideo && format.height) {
      const resolution = `${format.height}p`;
      if (!seenResolutions.has(resolution) && format.ext === "mp4") {
        seenResolutions.add(resolution);
        videoFormats.push({
          formatId: format.format_id,
          ext: format.ext,
          resolution,
          filesize: format.filesize || format.filesize_approx || null,
          tbr: format.tbr || null,
          vcodec: format.vcodec || null,
          acodec: format.acodec || null,
          fps: format.fps || null,
        });
      }
    } else if (hasAudio && !hasVideo) {
      const bitrate = Math.round(format.abr || format.tbr || 0);
      if (bitrate > 0 && !seenBitrates.has(bitrate)) {
        seenBitrates.add(bitrate);
        audioFormats.push({
          formatId: format.format_id,
          ext: format.ext,
          resolution: `${bitrate}kbps`,
          filesize: format.filesize || format.filesize_approx || null,
          tbr: bitrate,
          vcodec: null,
          acodec: format.acodec || null,
          fps: null,
        });
      }
    }
  }

  // Sort audio by bitrate (higher first)
  audioFormats.sort((a, b) => (b.tbr || 0) - (a.tbr || 0));

  return { videoFormats, audioFormats };
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const { stdout } = await spawnAsync("yt-dlp", [
    "--dump-json",
    "--no-warnings",
    url,
  ]);

  const data: YtDlpOutput = JSON.parse(stdout);
  const { videoFormats, audioFormats } = parseFormats(data.formats);

  return {
    id: data.id,
    title: data.title,
    thumbnail: data.thumbnail,
    duration: data.duration,
    durationFormatted: formatDuration(data.duration),
    uploader: data.uploader,
    viewCount: data.view_count,
    videoFormats,
    audioFormats,
  };
}

export async function downloadVideo(
  url: string,
  formatId: string,
  isAudioOnly: boolean
): Promise<{ data: Buffer; filename: string }> {
  // Get video info first for the title
  const { stdout: infoJson } = await spawnAsync("yt-dlp", [
    "--dump-json",
    "--no-warnings",
    url,
  ]);

  const info = JSON.parse(infoJson);
  const ext = isAudioOnly ? "m4a" : "mp4";
  const safeTitle = sanitizeFilename(info.title);
  const filename = `${safeTitle}.${ext}`;

  // Download using yt-dlp and pipe to stdout
  const args = isAudioOnly
    ? ["-f", formatId, "-o", "-", url]
    : ["-f", `${formatId}+bestaudio`, "--merge-output-format", "mp4", "-o", "-", url];

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const ytdlp = spawn("yt-dlp", args);

    // 5 minute timeout for downloads
    const timer = setTimeout(() => {
      ytdlp.kill("SIGTERM");
      reject(new Error("Download timed out after 5 minutes"));
    }, TIMEOUT_MS);

    ytdlp.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    ytdlp.stderr.on("data", (data: Buffer) => {
      console.log("[yt-dlp]", data.toString());
    });

    ytdlp.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    ytdlp.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({
          data: Buffer.concat(chunks),
          filename,
        });
      } else {
        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });
  });
}
