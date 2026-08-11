const UNSAFE_TEXT_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/gu

const LINE_SEPARATOR = /\r\n|[\n\r\u2028\u2029]/u

/** Escape characters that can create terminal sequences or forge text log records. */
export function escapeLogText(value: string): string {
  return value.replace(UNSAFE_TEXT_CHARACTERS, (character) => {
    switch (character) {
      case '\n':
        return '\\n'
      case '\r':
        return '\\r'
      case '\t':
        return '\\t'
      default: {
        const codePoint = character.codePointAt(0)
        return codePoint === undefined
          ? ''
          : `\\u${codePoint.toString(16).padStart(4, '0')}`
      }
    }
  })
}

/** Preserve multiline diagnostics while making every continuation visibly subordinate. */
export function formatLogLines(value: string): string {
  return value
    .split(LINE_SEPARATOR)
    .map((line) => escapeLogText(line))
    .join('\n  | ')
}

/** Escape raw Unicode controls that JSON.stringify is allowed to emit literally. */
export function escapeUnsafeJsonCharacters(value: string): string {
  return value.replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/gu,
    (character) => {
      const codePoint = character.codePointAt(0)
      return codePoint === undefined ? '' : `\\u${codePoint.toString(16).padStart(4, '0')}`
    },
  )
}
