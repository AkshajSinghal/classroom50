// @vitest-environment node
import path from "path"
import { fileURLToPath } from "url"
import { describe, expect, it } from "vitest"
import { ESLint } from "eslint"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const configPath = path.resolve(__dirname, "../../eslint.config.js")
const projectRoot = path.resolve(__dirname, "../..")

const BUTTON_FORM_SELECTOR =
  ":matches(JSXElement[openingElement.name.name='form'], JSXElement:has(JSXAttribute[name.name='as'][value.value='form'])) JSXOpeningElement[name.name='Button']:not(:has(JSXAttribute[name.name=/^(type|as|href)$/]))"
const BUTTON_FORM_MESSAGE =
  'A <Button> inside a <form> needs an explicit `type`: add type="submit" for the submit action or type="button" for a click handler. The <Button> default is "button", which silently disables implicit form submit.'

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
  it("pins the configured selector and message", async () => {
    const config = await import(configPath)
    type ConfigEntry = Record<string, unknown> | undefined
    const entries = Array.isArray(config.default)
      ? config.default
      : [config.default]
    const rulesArray: Array<Record<string, unknown> | undefined> = entries.map(
      (entry: ConfigEntry) =>
        (entry as Record<string, unknown> | undefined)?.rules as
          Record<string, unknown> | undefined,
    )
    const definedRules = rulesArray.filter(
      (rules): rules is Record<string, unknown> => Boolean(rules),
    )
    const ruleArrays = definedRules
      .map((rules) => rules["no-restricted-syntax"])
      .filter(Array.isArray) as Array<unknown[]>
    const ruleObjects = ruleArrays
      .flatMap((entry) => entry.slice(1))
      .filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null,
      )
    const buttonRule = ruleObjects.find(
      (entry) => entry.message === BUTTON_FORM_MESSAGE,
    )

    expect(buttonRule).toBeDefined()
    expect(buttonRule?.selector).toBe(BUTTON_FORM_SELECTOR)
  })

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

  it.each([
    `<Button type="submit">Go</Button>`,
    `<Button type="button">Go</Button>`,
    `<Button as="a" href="/">Go</Button>`,
    `<Button href="/">Go</Button>`,
    `<Card as="div"><Button>Go</Button></Card>`,
    `<Button>Go</Button>`,
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
