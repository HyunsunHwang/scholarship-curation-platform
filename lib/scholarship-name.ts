const YEAR_TOKEN = /(?:19|20)\d{2}\s*(?:년(?:도)?|학년도)?/g;
const SEMESTER_TOKEN = /(?:[12]\s*학기|(?:19|20)\d{2}\s*[-.]\s*[12]\s*학기?)/g;
const EMPTY_BRACKETS = /[\[(（(]\s*[\])）)]/g;
const REDUNDANT_SEPARATORS = /\s*[-–—|·,/]\s*(?=$)/g;

export function cleanScholarshipName(name: string): string {
  const cleaned = name
    .replace(SEMESTER_TOKEN, "")
    .replace(YEAR_TOKEN, "")
    .replace(EMPTY_BRACKETS, "")
    .replace(REDUNDANT_SEPARATORS, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s-–—|·,/]+|[\s-–—|·,/]+$/g, "")
    .trim();

  return cleaned || name;
}
