import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
  className?: string;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Renderizar bloques LaTeX $$...$$ y inline $...$
  const renderFormattedText = (text: string) => {
    // Expresión regular para capturar $$bloque$$ o $inline$
    const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g);

    return parts.map((part, index) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        const math = part.slice(2, -2).trim();
        try {
          const html = katex.renderToString(math, {
            displayMode: true,
            throwOnError: false
          });
          return (
            <div 
              key={index} 
              className="my-3 py-2.5 px-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg overflow-x-auto border border-slate-200/80 dark:border-slate-800 text-center select-all font-mono text-sm"
              dangerouslySetInnerHTML={{ __html: html }} 
            />
          );
        } catch (e) {
          return <code key={index} className="text-amber-600 block my-2 text-center">{part}</code>;
        }
      } else if (part.startsWith('$') && part.endsWith('$')) {
        const math = part.slice(1, -1).trim();
        try {
          const html = katex.renderToString(math, {
            displayMode: false,
            throwOnError: false
          });
          return <span key={index} className="inline-block px-1 align-baseline font-mono text-sm" dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (e) {
          return <code key={index} className="text-amber-600 px-1">{part}</code>;
        }
      }

      // Si es texto normal, manejar figuras [FIGURA: ...] y preservar saltos con whitespace-pre-wrap
      if (part.includes('[FIGURA:') || part.includes('[Figura:')) {
        const figParts = part.split(/(\[FIGURA:[^\]]+\]|\[Figura:[^\]]+\])/gi);
        return figParts.map((sub, sIdx) => {
          if (/^\[FIGURA:/i.test(sub)) {
            const desc = sub.replace(/^\[FIGURA:\s*/i, '').replace(/\]$/, '');
            return (
              <div 
                key={`${index}-${sIdx}`}
                className="my-3 p-3 bg-blue-50/80 dark:bg-blue-950/40 border-l-4 border-blue-600 rounded-r-lg text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2"
              >
                <span className="font-bold shrink-0">🖼️ [Figura / Gráfico]:</span>
                <span className="italic">{desc}</span>
              </div>
            );
          }
          return <span key={`${index}-${sIdx}`} className="whitespace-pre-wrap">{sub}</span>;
        });
      }

      return <span key={index} className="whitespace-pre-wrap leading-relaxed">{part}</span>;
    });
  };

  return (
    <div className={`whitespace-pre-wrap leading-relaxed ${className}`}>
      {renderFormattedText(content)}
    </div>
  );
};
