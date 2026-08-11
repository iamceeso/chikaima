"use client";

import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type MessageMarkdownProps = {
  content: string;
  className?: string;
};

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={`strong-${key++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={`em-${key++}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`code-${key++}`}
          className="rounded bg-background-secondary px-1 py-0.5 font-mono text-[0.95em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderParagraph(text: string, key: string) {
  return (
    <p key={key} className="text-[13px] leading-6 text-foreground sm:text-sm">
      {renderInlineMarkdown(text)}
    </p>
  );
}

export function MessageMarkdown({ content, className }: MessageMarkdownProps) {
  const blocks = content.trim().split(/\n{2,}/).filter(Boolean);

  if (!blocks.length) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n");
        const firstLine = lines[0]?.trim() ?? "";

        if (firstLine.startsWith("### ")) {
          return (
            <h3 key={`h3-${blockIndex}`} className="text-base font-semibold text-foreground">
              {renderInlineMarkdown(firstLine.slice(4))}
            </h3>
          );
        }

        if (firstLine.startsWith("## ")) {
          return (
            <h2 key={`h2-${blockIndex}`} className="text-lg font-semibold text-foreground">
              {renderInlineMarkdown(firstLine.slice(3))}
            </h2>
          );
        }

        if (firstLine.startsWith("# ")) {
          return (
            <h1 key={`h1-${blockIndex}`} className="text-xl font-semibold text-foreground">
              {renderInlineMarkdown(firstLine.slice(2))}
            </h1>
          );
        }

        if (lines.every((line) => line.trim().startsWith(">"))) {
          return (
            <blockquote
              key={`quote-${blockIndex}`}
              className="border-l-2 border-border pl-4 italic text-foreground-muted"
            >
              {lines.map((line, lineIndex) => (
                <Fragment key={`quote-line-${blockIndex}-${lineIndex}`}>
                  {lineIndex > 0 ? <br /> : null}
                  {renderInlineMarkdown(line.replace(/^>\s?/, ""))}
                </Fragment>
              ))}
            </blockquote>
          );
        }

        const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line.trim()));
        if (bulletLines.length === lines.length) {
          return (
            <ul key={`ul-${blockIndex}`} className="list-disc space-y-1 pl-5 text-[13px] leading-6 text-foreground sm:text-sm">
              {bulletLines.map((line, lineIndex) => (
                <li key={`li-${blockIndex}-${lineIndex}`}>{renderInlineMarkdown(line.trim().replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        const numberedLines = lines.filter((line) => /^\d+\.\s+/.test(line.trim()));
        if (numberedLines.length === lines.length) {
          return (
            <ol key={`ol-${blockIndex}`} className="list-decimal space-y-1 pl-5 text-[13px] leading-6 text-foreground sm:text-sm">
              {numberedLines.map((line, lineIndex) => (
                <li key={`oli-${blockIndex}-${lineIndex}`}>{renderInlineMarkdown(line.trim().replace(/^\d+\.\s+/, ""))}</li>
              ))}
            </ol>
          );
        }

        return renderParagraph(lines.join(" "), `p-${blockIndex}`);
      })}
    </div>
  );
}
