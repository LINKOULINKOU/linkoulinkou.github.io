import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Element, ElementContent, Root } from 'hast'
import rehypeSourceLines from './rehype-source-lines'

const paragraph = (children: ElementContent[], properties: Element['properties'] = {}): Element => ({
  type: 'element',
  tagName: 'p',
  properties,
  children
})
const text = (value: string): ElementContent => ({ type: 'text', value })
const transform = (...children: Element[]) => {
  const tree: Root = { type: 'root', children }
  rehypeSourceLines()(tree)
  return tree
}

describe('rehypeSourceLines', () => {
  it('marks source paragraphs with either colon and optional leading whitespace', () => {
    for (const value of ['来源：原文', '来源: original', ' \n\t来源：原文']) {
      const node = paragraph([text(value)])
      transform(node)
      assert.deepEqual(node.properties.className, ['ln-source-line'])
      assert.equal(node.children[0].type === 'text' && node.children[0].value, value)
    }
  })

  it('recognizes an inline-formatted prefix without replacing any nodes or attributes', () => {
    const label: Element = {
      type: 'element', tagName: 'strong', properties: {}, children: [text('来源')]
    }
    const link: Element = {
      type: 'element', tagName: 'a',
      properties: { href: 'https://example.com/source#evidence', rel: ['noopener'] },
      children: [text('原文')]
    }
    const children = [label, text('：'), link]
    const properties: Element['properties'] = { id: 'source-1', dataKeep: 'yes' }
    const node = paragraph(children, properties)
    const tree = transform(node)

    assert.equal(tree.children[0], node)
    assert.equal(node.children, children)
    assert.equal(node.children[0], label)
    assert.equal(node.children[2], link)
    assert.equal(node.properties, properties)
    assert.equal(node.properties.id, 'source-1')
    assert.equal(node.properties.dataKeep, 'yes')
    assert.deepEqual(link.properties, {
      href: 'https://example.com/source#evidence', rel: ['noopener']
    })
    assert.deepEqual(node.properties.className, ['ln-source-line'])
  })

  it('leaves ordinary paragraphs and non-paragraph elements unchanged', () => {
    const nodes = [
      paragraph([text('本文讨论来源：以及可靠性。')]),
      paragraph([text('来源分析：不是来源行')]),
      paragraph([text('其他'), { type: 'element', tagName: 'em', properties: {}, children: [text('来源：')] }]),
      { ...paragraph([text('来源：标题')]), tagName: 'h2' },
      { ...paragraph([text('来源: code')]), tagName: 'code' },
      paragraph([])
    ]
    const before = structuredClone(nodes)
    transform(...nodes)
    assert.deepEqual(nodes, before)
  })

  it('merges an existing class array and remains idempotent', () => {
    const node = paragraph([text('来源：原文')], { className: ['existing', 'other'] })
    transform(node)
    transform(node)
    assert.deepEqual(node.properties.className, ['existing', 'other', 'ln-source-line'])
  })

  it('does not duplicate an already-present source class', () => {
    const className = ['existing', 'ln-source-line']
    const node = paragraph([text('来源：原文')], { className })
    transform(node)
    assert.equal(node.properties.className, className)
  })

  it('visits paragraphs nested in containers without marking the containers', () => {
    const node = paragraph([text('来源：原文')])
    const container: Element = {
      type: 'element', tagName: 'blockquote', properties: {}, children: [node]
    }
    transform(container)
    assert.deepEqual(container.properties, {})
    assert.equal(container.children[0], node)
    assert.deepEqual(node.properties.className, ['ln-source-line'])
  })
})
