import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'

const MarkdownEditor = forwardRef(function MarkdownEditor({ value, onChange }, ref) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)

  useImperativeHandle(ref, () => ({
    replaceContent(newContent) {
      const view = viewRef.current
      if (!view) return
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: newContent }
      })
    }
  }))

  // Intentionally initialized once on mount — CodeMirror manages its own document state.
  // External value changes after mount are not synced back to the editor.
  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: value || '',
      extensions: [
        basicSetup,
        markdown(),
        yaml(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
    }
  }, [])

  return <div ref={containerRef} style={{ height: '100%' }} />
})

export default MarkdownEditor
