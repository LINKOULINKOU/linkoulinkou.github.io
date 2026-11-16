import type { Element, ElementContent, Root } from 'hast'
import { visit } from 'unist-util-visit'

const textContent = (node: ElementContent): string => {
  if (node.type === 'text') return node.value
  return node.type === 'element' ? node.children.map(textContent).join('') : ''
}

/** 标注来源段落，只加类，不改正文节点、链接或其他属性。 */
export default function rehypeSourceLines() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'p' || !/^\s*来源[：:]/.test(textContent(node))) return

      const classes = node.properties.className ?? []

      if (!classes.includes('ln-source-line')) {
        node.properties.className = [...classes, 'ln-source-line']
      }
    })
  }
}
