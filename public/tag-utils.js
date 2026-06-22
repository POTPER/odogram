export const TAG_PATTERN = /^[\p{L}\p{N}_-]{2,32}$/u;
export const MAX_TAGS = 5;
export const TAG_FORMAT_HINT = '2–32 个字符：中文、字母、数字、下划线、连字符，最多 5 个，逗号分隔';

export function parseTags(value) {
  if (!value || !String(value).trim()) return [];
  return String(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function validateTags(tags) {
  if (!Array.isArray(tags)) return TAG_FORMAT_HINT;
  if (tags.length > MAX_TAGS) return `最多 ${MAX_TAGS} 个标签`;
  for (const tag of tags) {
    if (!TAG_PATTERN.test(tag)) return TAG_FORMAT_HINT;
  }
  return null;
}
