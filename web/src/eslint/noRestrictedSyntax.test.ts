// @vitest-environment node
import path from "path"
import { fileURLToPath } from "url"
import { describe, expect, it } from "vitest"
import { ESLint } from "eslint"
import { buttonFormSelector, buttonFormMessage } from "./buttonFormRule.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const configPath = path.resolve(__dirname, "../../eslint.config.js")
const projectRoot = path.resolve(__dirname, "../..")

const BUTTON_FORM_SELECTOR = buttonFormSelector
const BUTTON_FORM_MESSAGE = buttonFormMessage

async function lintMessageCount(source: string) {
  const eslint = new ESLint({
    cwd: projectRoot,
    overrideConfigFile: configPath,
  })
  const [result] = await eslint.lintText(source, {
    filePath: path.join(projectRoot, "Button.test.tsx"),
  })
  return result.messages.filter(
    (message) =>
      message.ruleId === "no-restricted-syntax" &&
      message.message === BUTTON_FORM_MESSAGE,
  ).length
}

describe("no-restricted-syntax <Button> form guard", () => {
  // The selector and message are sourced from a shared module; importing
  // those values into the ESLint config and this test prevents accidental
  // drift between the rule and its tests.

  it("warns for a typeless <Button> inside a <form>", async () => {
    const source = `
      import { Button } from "./Button"
      export function App() {
        return <form><Button>Go</Button></form>
      }
    `
    expect(await lintMessageCount(source)).toBe(1)
  })

  it('warns for a typeless <Button> inside <Card as="form">', async () => {
    const source = `
      import { Button } from "./Button"
      import { Card } from "./Card"
      export function App() {
        return <Card as="form"><Button>Go</Button></Card>
      }
    `
    expect(await lintMessageCount(source)).toBe(1)
  })

  it("warns for a nested typeless <Button> inside a <form>", async () => {
    const source = `
      import { Button } from "./Button"
      export function App() {
        return <form><div><Button>Go</Button></div></form>
      }
    `
    expect(await lintMessageCount(source)).toBe(1)
  })

  it("warns for a typeless <Button> wrapping a typed child", async () => {
    const source = `
      import { Button } from "./Button"
      export function App() {
        return (
          <form>
            <Button><input type="text" /></Button>
          </form>
        )
      }
    `
    expect(await lintMessageCount(source)).toBe(1)
  })

  it('warns for a typeless <Button> inside a <form> with a non-safe attr', async () => {
    const source = `
      import { Button } from "./Button"
      export function App() {
        return <form><Button onClick={save}>Save</Button></form>
      }
    `
    expect(await lintMessageCount(source)).toBe(1)
  })

  it('warns for a typeless <Button> inside a <form> with a look-alike attr', async () => {
    const source = `
      import { Button } from "./Button"
      export function App() {
        return <form><Button data-type="x">Go</Button></form>
      }
    `
    expect(await lintMessageCount(source)).toBe(1)
  })

  it.each([
    `<Button type="submit">Go</Button>`,
    `<Button type="button">Go</Button>`,
    `<Button as="a" href="/">Go</Button>`,
    `<Button href="/">Go</Button>`,
    `<Card as="div"><Button>Go</Button></Card>`,
    `<form><Button as="div">Go</Button></form>`,
    `<Button>Go</Button>`,
    `<Button type="submit" onClick={h} className="x">Go</Button>`,
  ])("does not warn for safe button shapes: %s", async (jsx) => {
    const source = `
      import { Button } from "./Button"
      import { Card } from "./Card"
      export function App() {
        return <div>${jsx}</div>
      }
    `
    expect(await lintMessageCount(source)).toBe(0)
  })
})
