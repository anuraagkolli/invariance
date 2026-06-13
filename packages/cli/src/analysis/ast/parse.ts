import path from 'path'

import { Project, ts } from 'ts-morph'

/**
 * Load a ts-morph Project for the given app root. Uses the app's tsconfig.json
 * if present, otherwise falls back to a permissive in-memory project with the
 * app's source files added.
 */
export function loadProject(appRoot: string): Project {
  const abs = path.resolve(appRoot)
  const tsconfigPath = path.join(abs, 'tsconfig.json')

  let project: Project
  try {
    project = new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: false,
      skipFileDependencyResolution: true,
      compilerOptions: {
        allowJs: true,
        noEmit: true,
      },
    })
  } catch {
    project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        noEmit: true,
        jsx: 4, // React JSX preserve
      },
    })
  }

  // Ensure jsx/tsx files from the app are in the project regardless of how
  // tsconfig "include" was set up.
  project.addSourceFilesAtPaths([
    path.join(abs, 'src/**/*.{ts,tsx,js,jsx}'),
    path.join(abs, 'app/**/*.{ts,tsx,js,jsx}'),
    path.join(abs, 'pages/**/*.{ts,tsx,js,jsx}'),
    path.join(abs, 'components/**/*.{ts,tsx,js,jsx}'),
  ])

  return project
}

/**
 * Compute a dotted JSX path from the nearest enclosing function/arrow return
 * down to the given node, e.g. "div>main>section[1]".
 *
 * Operates on raw TypeScript compiler nodes. Walks up to find the enclosing
 * function, then walks back down through JSX ancestors, recording sibling
 * indices where a tag appears more than once at the same level.
 */
export function jsxPathOf(node: ts.Node): string {
  // Find the enclosing function/arrow so we stop the path at the root.
  let containerStop: ts.Node | undefined
  let cursor: ts.Node | undefined = node
  while (cursor) {
    const kind = cursor.kind
    if (
      kind === ts.SyntaxKind.FunctionDeclaration ||
      kind === ts.SyntaxKind.ArrowFunction ||
      kind === ts.SyntaxKind.FunctionExpression ||
      kind === ts.SyntaxKind.MethodDeclaration
    ) {
      containerStop = cursor
      break
    }
    cursor = cursor.parent
  }

  // Collect ancestor chain of JsxElement / JsxSelfClosingElement up to (but not past) the container.
  const chain: ts.Node[] = []
  let walk: ts.Node | undefined = node
  while (walk && walk !== containerStop) {
    const k = walk.kind
    if (k === ts.SyntaxKind.JsxElement || k === ts.SyntaxKind.JsxSelfClosingElement) {
      chain.push(walk)
    }
    walk = walk.parent
  }
  chain.reverse()

  const segments: string[] = []
  for (const el of chain) {
    const tagName = getJsxTagName(el)
    if (!tagName) continue

    // Determine sibling index among JSX elements with the same tag at this level.
    let indexSuffix = ''
    const parentNode = el.parent
    if (parentNode) {
      const siblings: ts.Node[] = []
      parentNode.forEachChild((child) => {
        const ck = child.kind
        if (ck === ts.SyntaxKind.JsxElement || ck === ts.SyntaxKind.JsxSelfClosingElement) {
          if (getJsxTagName(child) === tagName) siblings.push(child)
        }
      })
      if (siblings.length > 1) {
        const idx = siblings.indexOf(el)
        indexSuffix = `[${idx}]`
      }
    }
    segments.push(`${tagName}${indexSuffix}`)
  }

  return segments.join('>')
}

function getJsxTagName(el: ts.Node): string | null {
  let tagNameNode: ts.Node | undefined
  if (el.kind === ts.SyntaxKind.JsxElement) {
    tagNameNode = (el as ts.JsxElement).openingElement.tagName
  } else if (el.kind === ts.SyntaxKind.JsxSelfClosingElement) {
    tagNameNode = (el as ts.JsxSelfClosingElement).tagName
  }
  if (!tagNameNode) return null
  return readTagName(tagNameNode)
}

function readTagName(node: ts.Node): string {
  if (node.kind === ts.SyntaxKind.Identifier) {
    return (node as ts.Identifier).text
  }
  if (node.kind === ts.SyntaxKind.PropertyAccessExpression) {
    const pa = node as ts.PropertyAccessExpression
    return `${readTagName(pa.expression)}.${pa.name.text}`
  }
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    return 'this'
  }
  return ''
}
