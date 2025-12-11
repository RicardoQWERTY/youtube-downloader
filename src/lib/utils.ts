import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitize a filename by removing/replacing invalid characters
 * @param filename - The original filename
 * @param maxLength - Maximum length of the filename (default: 200)
 * @returns A safe filename
 */
export function sanitizeFilename(filename: string, maxLength = 200): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-") // Replace invalid chars with dash
    .replace(/-+/g, "-") // Replace multiple dashes with single dash
    .replace(/^-|-$/g, "") // Remove leading/trailing dashes
    .trim()
    .substring(0, maxLength);
}
