import { type ReactNode } from 'react';

/**
 * Renderer mínimo de markdown a JSX. Soporta solo lo que usamos en los T&C
 * (y otros textos editables por super admin): headings #/##/###, párrafos,
 * listas con `- `, negrita con `**texto**`. Cualquier otra cosa cae a texto
 * plano. No usa dangerouslySetInnerHTML — todo va por React, así que no hay
 * riesgo de XSS aunque el contenido venga de DB editado por humanos.
 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return <div className={className}>{renderBlocks(source)}</div>;
}

function renderBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let listItems: string[] | null = null;
  let paragraphLines: string[] | null = null;
  let key = 0;

  const flushList = () => {
    if (listItems && listItems.length > 0) {
      blocks.push(
        <ul key={`ul-${key++}`} className="my-3 list-disc space-y-1 pl-6 text-sm text-gray-700">
          {listItems.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>,
      );
    }
    listItems = null;
  };

  const flushParagraph = () => {
    if (paragraphLines && paragraphLines.length > 0) {
      const text = paragraphLines.join(' ');
      blocks.push(
        <p key={`p-${key++}`} className="my-2 text-sm leading-relaxed text-gray-700">
          {renderInline(text)}
        </p>,
      );
    }
    paragraphLines = null;
  };

  const flushAll = () => {
    flushList();
    flushParagraph();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === '') {
      flushAll();
      continue;
    }
    if (line.startsWith('### ')) {
      flushAll();
      blocks.push(
        <h3 key={`h3-${key++}`} className="mt-5 mb-2 text-base font-semibold text-[#175861]">
          {renderInline(line.slice(4))}
        </h3>,
      );
      continue;
    }
    if (line.startsWith('## ')) {
      flushAll();
      blocks.push(
        <h2 key={`h2-${key++}`} className="mt-6 mb-2 text-lg font-bold text-[#175861]">
          {renderInline(line.slice(3))}
        </h2>,
      );
      continue;
    }
    if (line.startsWith('# ')) {
      flushAll();
      blocks.push(
        <h1 key={`h1-${key++}`} className="mt-2 mb-4 text-2xl font-bold text-[#175861]">
          {renderInline(line.slice(2))}
        </h1>,
      );
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push(line.slice(2));
      continue;
    }
    if (line === '---') {
      flushAll();
      blocks.push(<hr key={`hr-${key++}`} className="my-4 border-gray-200" />);
      continue;
    }
    if (!paragraphLines) paragraphLines = [];
    paragraphLines.push(line);
  }
  flushAll();
  return blocks;
}

function renderInline(text: string): ReactNode {
  // Bold **xxx**. Devolvemos partes alternadas de string y <strong>.
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    parts.push(<strong key={i++}>{m[1]}</strong>);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}
