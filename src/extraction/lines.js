/** Group positioned text into reading-order lines, retaining column positions. */
export function groupLines(page, tolerance = 2) {
  const lines = [];
  for (const item of [...page.items].filter(item => item.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const previous = lines.at(-1);
    if (previous && Math.abs(previous.y - item.y) <= tolerance) previous.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines.map((line, index) => {
    const items = line.items.sort((a, b) => a.x - b.x);
    return { y: line.y, number: index + 1, items,
      text: items.map(item => item.text).join(' ').replace(/\s+/g, ' ').trim() };
  });
}
