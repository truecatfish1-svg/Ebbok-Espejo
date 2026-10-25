export function sanitizeMarkdownMath(text: string): string {
  if (!text) return text;
  
  let cleaned = text;
  
  // 1. Sanitize accented characters inside \text{...} and \mathrm{...}
  // Matches \text{...} or \mathrm{...}
  cleaned = cleaned.replace(/\\(text|mathrm)\{([^{}]+)\}/g, (match, command, innerText) => {
    const sanitized = innerText
      .replace(/á/g, 'a')
      .replace(/é/g, 'e')
      .replace(/í/g, 'i')
      .replace(/ó/g, 'o')
      .replace(/ú/g, 'u')
      .replace(/Á/g, 'A')
      .replace(/É/g, 'E')
      .replace(/Í/g, 'I')
      .replace(/Ó/g, 'O')
      .replace(/Ú/g, 'U')
      .replace(/ñ/g, 'n')
      .replace(/Ñ/g, 'N');
    return `\\${command}{${sanitized}}`;
  });

  // 2. Ensure block formulas with $$ have their own lines so remark-math parses them perfectly
  // This avoids inline block formulas which fail to parse in many Markdown compilers
  cleaned = cleaned.replace(/(?<!\n)\$\$(?!\n)/g, '\n$$\n');
  
  return cleaned;
}
