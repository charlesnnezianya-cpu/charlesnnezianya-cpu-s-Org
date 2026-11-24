import React, { useId, useMemo, useState } from 'react';
import { GitBranch, Info, Layers, LineChart, Table2 } from 'lucide-react';
import type { DiagramEdge, DiagramNode, EducationalDiagramSpec } from '../types/brainstine';

interface EducationalDiagramRendererProps {
  spec: EducationalDiagramSpec;
  compact?: boolean;
}

function wrapSvgLines(text: string, maxCharsPerLine: number, maxLines = 3): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  const usedWordsCount = lines.join(' ').split(/\s+/).filter(Boolean).length + (current ? 1 : 0);
  if (current) {
    if (lines.length < maxLines) {
      const remaining = words.slice(usedWordsCount);
      const tail = remaining.length > 0 ? `${current} ${remaining.join(' ')}` : current;
      lines.push(
        tail.length > maxCharsPerLine + 2
          ? `${tail.slice(0, maxCharsPerLine - 1).trimEnd()}…`
          : tail
      );
    }
  }
  return lines.slice(0, maxLines);
}

function getToneClasses(tone?: DiagramNode['tone']) {
  switch (tone) {
    case 'primary':
      return {
        box: 'fill-[#EFF6FF] stroke-[#1D4ED8] dark:fill-[#132A5C] dark:stroke-[#38BDF8]',
        title: 'fill-[#0F1E3D] dark:fill-white',
        sub: 'fill-[#1E40AF] dark:fill-sky-200',
        badge: 'bg-blue-50 text-[#1D4ED8] dark:bg-blue-950/60 dark:text-sky-300',
      };
    case 'accent':
      return {
        box: 'fill-[#ECFEFF] stroke-[#0284C7] dark:fill-[#0F2942] dark:stroke-[#38BDF8]',
        title: 'fill-[#0F172A] dark:fill-white',
        sub: 'fill-[#0369A1] dark:fill-cyan-200',
        badge: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
      };
    case 'success':
      return {
        box: 'fill-[#ECFDF5] stroke-[#059669] dark:fill-[#063226] dark:stroke-[#34D399]',
        title: 'fill-[#064E3B] dark:fill-emerald-50',
        sub: 'fill-[#047857] dark:fill-emerald-200',
        badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
      };
    case 'warning':
      return {
        box: 'fill-[#FFFBEB] stroke-[#D97706] dark:fill-[#3B2608] dark:stroke-[#FBBF24]',
        title: 'fill-[#78350F] dark:fill-amber-50',
        sub: 'fill-[#B45309] dark:fill-amber-200',
        badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
      };
    default:
      return {
        box: 'fill-white stroke-slate-300 dark:fill-slate-800/90 dark:stroke-slate-600',
        title: 'fill-slate-900 dark:fill-slate-100',
        sub: 'fill-slate-500 dark:fill-slate-300',
        badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      };
  }
}

export const EducationalDiagramRenderer = React.memo(function EducationalDiagramRenderer({
  spec,
  compact = false,
}: EducationalDiagramRendererProps) {
  const markerId = useId().replace(/:/g, '');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const nodes = useMemo(() => spec.nodes ?? [], [spec.nodes]);
  const edges = useMemo(() => spec.edges ?? [], [spec.edges]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const TypeIcon =
    spec.type === 'cartesian_plot'
      ? LineChart
      : spec.type === 'comparison_matrix'
        ? Table2
        : spec.type === 'scientific_system'
          ? Layers
          : GitBranch;

  const typeLabel =
    spec.type === 'process_flow'
      ? 'Process Diagram'
      : spec.type === 'concept_map'
        ? 'Concept Map'
        : spec.type === 'comparison_matrix'
          ? 'Comparison Visual'
          : spec.type === 'cartesian_plot'
            ? 'Quantitative Plot'
            : 'Labeled System Diagram';

  const renderProcessOrConceptSvg = () => {
    if (nodes.length === 0) return null;

    const isProcess = spec.type === 'process_flow';
    const boxW = 166;
    const boxH = 74;

    // Position calculation
    const positions = new Map<string, { x: number; y: number }>();
    let svgW = 720;
    let svgH = 260;

    if (isProcess) {
      const cols = Math.min(3, Math.max(1, nodes.length));
      const rows = Math.ceil(nodes.length / cols);
      const gapX = 54;
      const gapY = 48;
      const padX = 28;
      const padY = 26;
      svgW = padX * 2 + cols * boxW + Math.max(0, cols - 1) * gapX;
      svgH = padY * 2 + rows * boxH + Math.max(0, rows - 1) * gapY;

      nodes.forEach((node, idx) => {
        const row = Math.floor(idx / cols);
        const colRaw = idx % cols;
        // Snaking left-to-right then right-to-left keeps multi-row flow continuous
        const col = row % 2 === 1 ? cols - 1 - colRaw : colRaw;
        positions.set(node.id, {
          x: padX + col * (boxW + gapX),
          y: padY + row * (boxH + gapY),
        });
      });
    } else {
      // Concept map / hierarchy: root node at top center, remaining in clean balanced grid below
      const root = nodes[0];
      const children = nodes.slice(1);
      const cols = Math.min(3, Math.max(1, children.length));
      const childRows = Math.ceil(children.length / cols);
      const gapX = 36;
      const gapY = 58;
      const padX = 28;
      const padY = 24;
      svgW = Math.max(460, padX * 2 + cols * boxW + Math.max(0, cols - 1) * gapX);
      svgH = padY * 2 + (1 + childRows) * boxH + childRows * gapY;

      positions.set(root.id, {
        x: svgW / 2 - boxW / 2,
        y: padY,
      });

      children.forEach((node, idx) => {
        const row = Math.floor(idx / cols);
        const itemsInRow =
          row === childRows - 1 && children.length % cols !== 0 ? children.length % cols : cols;
        const col = idx % cols;
        const rowWidth = itemsInRow * boxW + (itemsInRow - 1) * gapX;
        const startX = (svgW - rowWidth) / 2;
        positions.set(node.id, {
          x: startX + col * (boxW + gapX),
          y: padY + (row + 1) * (boxH + gapY),
        });
      });
    }

    const effectiveEdges: DiagramEdge[] =
      edges.length > 0
        ? edges
        : isProcess
          ? nodes.slice(0, -1).map((n, idx) => ({ from: n.id, to: nodes[idx + 1].id }))
          : nodes.slice(1).map((n) => ({ from: nodes[0].id, to: n.id }));

    return (
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={spec.title}
      >
        <defs>
          <marker
            id={`arrow-${markerId}`}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,1 L7,4 L0,7 Z" className="fill-[#1D4ED8] dark:fill-[#38BDF8]" />
          </marker>
        </defs>

        {effectiveEdges.map((edge, idx) => {
          const fromPos = positions.get(edge.from);
          const toPos = positions.get(edge.to);
          if (!fromPos || !toPos) return null;

          const x1 = fromPos.x + boxW / 2;
          const y1 = fromPos.y + boxH / 2;
          const x2 = toPos.x + boxW / 2;
          const y2 = toPos.y + boxH / 2;

          // Trim endpoints to box border
          const dx = x2 - x1;
          const dy = y2 - y1;
          const absDx = Math.abs(dx) || 0.001;
          const absDy = Math.abs(dy) || 0.001;
          const scaleStart = Math.min((boxW / 2 + 4) / absDx, (boxH / 2 + 4) / absDy);
          const scaleEnd = Math.min((boxW / 2 + 8) / absDx, (boxH / 2 + 8) / absDy);

          const sx = x1 + dx * scaleStart;
          const sy = y1 + dy * scaleStart;
          const ex = x2 - dx * scaleEnd;
          const ey = y2 - dy * scaleEnd;

          const midX = (sx + ex) / 2;
          const midY = (sy + ey) / 2;

          return (
            <g key={`edge-${idx}`}>
              <line
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                strokeWidth="1.8"
                className="stroke-[#1D4ED8]/70 dark:stroke-[#38BDF8]/70"
                markerEnd={`url(#arrow-${markerId})`}
              />
              {edge.label && (
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect
                    x={-Math.min(58, edge.label.length * 3.4 + 10)}
                    y={-10}
                    width={Math.min(116, edge.label.length * 6.8 + 20)}
                    height={19}
                    rx={6}
                    className="fill-white stroke-slate-200 dark:fill-slate-900 dark:stroke-slate-700"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-slate-600 text-[9.5px] font-medium dark:fill-slate-300"
                  >
                    {edge.label.length > 18 ? `${edge.label.slice(0, 17)}…` : edge.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {nodes.map((node, idx) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const tone = getToneClasses(node.tone ?? (idx === 0 ? 'primary' : 'neutral'));
          const titleLines = wrapSvgLines(node.label, 20, 2);
          const subLines = node.sublabel ? wrapSvgLines(node.sublabel, 24, 1) : [];
          const isSelected = selectedNodeId === node.id;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
              className="cursor-pointer transition-opacity hover:opacity-90"
            >
              <rect
                width={boxW}
                height={boxH}
                rx={12}
                strokeWidth={isSelected ? 2.4 : 1.5}
                className={tone.box}
              />
              {isProcess && (
                <text
                  x={10}
                  y={16}
                  className="fill-[#1D4ED8] font-mono text-[9.5px] font-semibold dark:fill-sky-300"
                >
                  {String(idx + 1).padStart(2, '0')}
                </text>
              )}
              <text
                x={boxW / 2}
                y={subLines.length > 0 ? 27 : 33}
                textAnchor="middle"
                className={`${tone.title} text-[12px] font-semibold`}
              >
                {titleLines.map((line, lineIdx) => (
                  <tspan key={lineIdx} x={boxW / 2} dy={lineIdx === 0 ? 0 : 14}>
                    {line}
                  </tspan>
                ))}
              </text>
              {subLines.length > 0 && (
                <text
                  x={boxW / 2}
                  y={boxH - 12}
                  textAnchor="middle"
                  className={`${tone.sub} text-[10px] font-medium`}
                >
                  {subLines[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  const renderScientificSystemSvg = () => {
    if (nodes.length === 0) return null;
    const svgW = 700;
    const svgH = 380;
    const boxW = 148;
    const boxH = 58;

    const coords = new Map<string, { cx: number; cy: number }>();
    nodes.forEach((node, idx) => {
      if (typeof node.x === 'number' && typeof node.y === 'number') {
        const clampedX = Math.max(14, Math.min(86, node.x));
        const clampedY = Math.max(14, Math.min(86, node.y));
        coords.set(node.id, {
          cx: (clampedX / 100) * svgW,
          cy: (clampedY / 100) * svgH,
        });
      } else {
        const angle = (idx / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
        const rx = svgW * 0.34;
        const ry = svgH * 0.33;
        coords.set(node.id, {
          cx: svgW / 2 + Math.cos(angle) * rx,
          cy: svgH / 2 + Math.sin(angle) * ry,
        });
      }
    });

    return (
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={spec.title}
      >
        <defs>
          <pattern id={`grid-${markerId}`} width="32" height="32" patternUnits="userSpaceOnUse">
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              className="stroke-slate-200/60 dark:stroke-slate-800/70"
              strokeWidth="1"
            />
          </pattern>
          <marker
            id={`sys-arrow-${markerId}`}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,1 L7,4 L0,7 Z" className="fill-[#0284C7] dark:fill-[#38BDF8]" />
          </marker>
        </defs>

        <rect width={svgW} height={svgH} rx={12} fill={`url(#grid-${markerId})`} />

        {edges.map((edge, idx) => {
          const a = coords.get(edge.from);
          const b = coords.get(edge.to);
          if (!a || !b) return null;
          const dx = b.cx - a.cx;
          const dy = b.cy - a.cy;
          const dist = Math.hypot(dx, dy) || 1;
          const sx = a.cx + (dx / dist) * 32;
          const sy = a.cy + (dy / dist) * 24;
          const ex = b.cx - (dx / dist) * 44;
          const ey = b.cy - (dy / dist) * 30;
          const mx = (sx + ex) / 2;
          const my = (sy + ey) / 2;

          return (
            <g key={`sys-edge-${idx}`}>
              <line
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                strokeWidth="1.8"
                strokeDasharray={edge.bidirectional ? '4 3' : undefined}
                className="stroke-[#0284C7]/75 dark:stroke-[#38BDF8]/80"
                markerEnd={`url(#sys-arrow-${markerId})`}
              />
              {edge.label && (
                <text
                  x={mx}
                  y={my - 6}
                  textAnchor="middle"
                  className="fill-slate-600 text-[9.5px] font-medium dark:fill-slate-300"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((node, idx) => {
          const pt = coords.get(node.id);
          if (!pt) return null;
          const tone = getToneClasses(node.tone ?? (idx === 0 ? 'primary' : 'accent'));
          const titleLines = wrapSvgLines(node.label, 18, 2);
          const subLines = node.sublabel ? wrapSvgLines(node.sublabel, 20, 1) : [];
          const isSelected = selectedNodeId === node.id;

          return (
            <g
              key={node.id}
              transform={`translate(${pt.cx - boxW / 2}, ${pt.cy - boxH / 2})`}
              onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
              className="cursor-pointer"
            >
              <rect
                width={boxW}
                height={boxH}
                rx={10}
                strokeWidth={isSelected ? 2.4 : 1.5}
                className={tone.box}
              />
              <text
                x={boxW / 2}
                y={subLines.length > 0 ? 22 : 26}
                textAnchor="middle"
                className={`${tone.title} text-[11.5px] font-semibold`}
              >
                {titleLines.map((line, lIdx) => (
                  <tspan key={lIdx} x={boxW / 2} dy={lIdx === 0 ? 0 : 13}>
                    {line}
                  </tspan>
                ))}
              </text>
              {subLines.length > 0 && (
                <text
                  x={boxW / 2}
                  y={boxH - 10}
                  textAnchor="middle"
                  className={`${tone.sub} text-[9.5px] font-medium`}
                >
                  {subLines[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  const renderCartesianPlotSvg = () => {
    const series = (spec.series ?? []).map((s) => ({
      ...s,
      points: (s.points ?? []).filter(
        (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
      ),
    }));
    const allPts = series.flatMap((s) => s.points);
    if (allPts.length === 0) return null;

    const svgW = 680;
    const svgH = 310;
    const padL = 62;
    const padR = 28;
    const padT = 26;
    const padB = 48;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;

    const xs = allPts.map((p) => p.x);
    const ys = allPts.map((p) => p.y);
    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);

    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }
    const xPad = (maxX - minX) * 0.08;
    const yPad = (maxY - minY) * 0.12;
    minX -= xPad;
    maxX += xPad;
    minY -= yPad;
    maxY += yPad;

    const mapX = (x: number) => padL + ((x - minX) / (maxX - minX)) * plotW;
    const mapY = (y: number) => padT + plotH - ((y - minY) / (maxY - minY)) * plotH;

    const strokeColor = (c?: string) =>
      c === 'emerald'
        ? '#10B981'
        : c === 'amber'
          ? '#F59E0B'
          : c === 'cyan'
            ? '#0284C7'
            : '#1D4ED8';

    const ticks = [0, 0.25, 0.5, 0.75, 1];

    return (
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={spec.title}
      >
        {ticks.map((t, idx) => {
          const yPos = padT + plotH * (1 - t);
          const xPos = padL + plotW * t;
          const yVal = minY + (maxY - minY) * t;
          const xVal = minX + (maxX - minX) * t;
          return (
            <g key={`tick-${idx}`}>
              <line
                x1={padL}
                y1={yPos}
                x2={padL + plotW}
                y2={yPos}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1"
              />
              <line
                x1={xPos}
                y1={padT}
                x2={xPos}
                y2={padT + plotH}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1"
              />
              <text
                x={padL - 8}
                y={yPos + 3}
                textAnchor="end"
                className="fill-slate-500 font-mono text-[9.5px] dark:fill-slate-400"
              >
                {Number(yVal.toFixed(1))}
              </text>
              <text
                x={xPos}
                y={padT + plotH + 15}
                textAnchor="middle"
                className="fill-slate-500 font-mono text-[9.5px] dark:fill-slate-400"
              >
                {Number(xVal.toFixed(1))}
              </text>
            </g>
          );
        })}

        {/* Axes */}
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={padT + plotH}
          className="stroke-slate-400 dark:stroke-slate-500"
          strokeWidth="1.5"
        />
        <line
          x1={padL}
          y1={padT + plotH}
          x2={padL + plotW}
          y2={padT + plotH}
          className="stroke-slate-400 dark:stroke-slate-500"
          strokeWidth="1.5"
        />

        {spec.xAxisLabel && (
          <text
            x={padL + plotW / 2}
            y={svgH - 8}
            textAnchor="middle"
            className="fill-slate-700 text-[11px] font-semibold dark:fill-slate-300"
          >
            {spec.xAxisLabel}
          </text>
        )}
        {spec.yAxisLabel && (
          <text
            x={16}
            y={padT + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 16 ${padT + plotH / 2})`}
            className="fill-slate-700 text-[11px] font-semibold dark:fill-slate-300"
          >
            {spec.yAxisLabel}
          </text>
        )}

        {series.map((s, sIdx) => {
          const color = strokeColor(s.color);
          const pts = (s.points ?? []).map((p) => `${mapX(p.x)},${mapY(p.y)}`).join(' ');
          return (
            <g key={`series-${sIdx}`}>
              <polyline
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts}
              />
              {(s.points ?? []).map((p, pIdx) => {
                const cx = mapX(p.x);
                const cy = mapY(p.y);
                return (
                  <g key={`pt-${pIdx}`}>
                    <circle cx={cx} cy={cy} r={3.8} fill={color} className="stroke-white dark:stroke-slate-900" strokeWidth="1.4" />
                    {p.label && (
                      <text
                        x={cx}
                        y={cy - 9}
                        textAnchor="middle"
                        className="fill-slate-700 text-[9.5px] font-medium dark:fill-slate-200"
                      >
                        {p.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {(spec.annotations ?? []).map((ann, idx) => (
          <g key={`ann-${idx}`} transform={`translate(${mapX(ann.x)}, ${mapY(ann.y)})`}>
            <circle r={4.5} className="fill-amber-500" />
            <text
              x={8}
              y={-6}
              className="fill-amber-700 text-[10px] font-semibold dark:fill-amber-300"
            >
              {ann.text}
            </text>
          </g>
        ))}
      </svg>
    );
  };

  const renderComparisonMatrix = () => {
    const columns = spec.columns ?? [];
    const rows = spec.rows ?? [];
    if (columns.length === 0 && rows.length === 0) return null;

    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse text-left text-xs sm:text-sm academic-selectable">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/80">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-3.5 py-2.5 font-display text-xs font-semibold tracking-wide text-slate-900 dark:text-white"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="bg-white odd:bg-white even:bg-slate-50/70 dark:bg-slate-900/40 dark:even:bg-slate-800/30"
              >
                <td className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                  {row.label}
                </td>
                {row.cells.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className="px-3.5 py-2.5 text-slate-700 dark:text-slate-300"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <figure
      className={`my-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-700/80 dark:bg-slate-900/60 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1D4ED8]/10 text-[#1D4ED8] dark:bg-sky-500/15 dark:text-sky-300">
            <TypeIcon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <figcaption className="truncate font-display text-sm font-semibold text-slate-900 dark:text-white">
              {spec.title}
            </figcaption>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {typeLabel}
              {spec.subject ? ` · ${spec.subject}` : ''}
            </p>
          </div>
        </div>
        {nodes.some((n) => n.detail) && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <Info className="h-3 w-3" aria-hidden="true" />
            <span>Tap a block for notes</span>
          </span>
        )}
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-[#0B1426]">
        {spec.type === 'comparison_matrix'
          ? renderComparisonMatrix()
          : spec.type === 'cartesian_plot'
            ? renderCartesianPlotSvg()
            : spec.type === 'scientific_system'
              ? renderScientificSystemSvg()
              : renderProcessOrConceptSvg()}
      </div>

      {spec.type === 'cartesian_plot' && (spec.series?.length ?? 0) > 1 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300 select-none">
          {spec.series?.map((s, idx) => (
            <span key={idx} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-xs"
                style={{
                  backgroundColor:
                    s.color === 'emerald'
                      ? '#10B981'
                      : s.color === 'amber'
                        ? '#F59E0B'
                        : s.color === 'cyan'
                          ? '#0284C7'
                          : '#1D4ED8',
                }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}

      {selectedNode && (selectedNode.detail || selectedNode.sublabel) && (
        <div className="mt-2.5 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-slate-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-slate-200 academic-selectable">
          <span className="font-semibold text-[#0F1E3D] dark:text-white">
            {selectedNode.label}:{' '}
          </span>
          <span>{selectedNode.detail || selectedNode.sublabel}</span>
        </div>
      )}

      {spec.caption && (
        <p className="mt-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300 academic-selectable">
          {spec.caption}
        </p>
      )}
    </figure>
  );
});
