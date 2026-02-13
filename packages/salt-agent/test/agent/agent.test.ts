import { describe, it, expect, afterEach } from "vitest"
import { Agent } from "../../src/agent/agent.js"

describe("Agent", () => {
  afterEach(() => {
    Agent.reset()
  })

  it("get returns build agent", async () => {
    const agent = await Agent.get("build")
    expect(agent.name).toBe("build")
    expect(agent.mode).toBe("primary")
  })

  it("get returns plan agent", async () => {
    const agent = await Agent.get("plan")
    expect(agent.name).toBe("plan")
    expect(agent.mode).toBe("primary")
  })

  it("get returns general agent", async () => {
    const agent = await Agent.get("general")
    expect(agent.name).toBe("general")
    expect(agent.mode).toBe("subagent")
  })

  it("get returns explore agent", async () => {
    const agent = await Agent.get("explore")
    expect(agent.name).toBe("explore")
    expect(agent.mode).toBe("subagent")
  })

  it("get throws for unknown agent", async () => {
    await expect(Agent.get("nonexistent")).rejects.toThrow("找不到代理")
  })

  it("list returns all 4 agents", async () => {
    const agents = await Agent.list()
    expect(agents).toHaveLength(4)
    const names = agents.map((a) => a.name)
    expect(names).toContain("build")
    expect(names).toContain("plan")
    expect(names).toContain("general")
    expect(names).toContain("explore")
  })

  it("defaultAgent returns 'build'", async () => {
    const defaultName = await Agent.defaultAgent()
    expect(defaultName).toBe("build")
  })

  it("build agent has question and plan_enter permissions", async () => {
    const agent = await Agent.get("build")
    const questionRule = agent.permission.find(
      (r) => r.permission === "question" && r.action === "allow",
    )
    const planEnterRule = agent.permission.find(
      (r) => r.permission === "plan_enter" && r.action === "allow",
    )
    expect(questionRule).toBeDefined()
    expect(planEnterRule).toBeDefined()
  })

  it("plan agent denies edit, write, bash", async () => {
    const agent = await Agent.get("plan")
    const editDeny = agent.permission.find(
      (r) => r.permission === "edit" && r.action === "deny",
    )
    const writeDeny = agent.permission.find(
      (r) => r.permission === "write" && r.action === "deny",
    )
    const bashDeny = agent.permission.find(
      (r) => r.permission === "bash" && r.action === "deny",
    )
    expect(editDeny).toBeDefined()
    expect(writeDeny).toBeDefined()
    expect(bashDeny).toBeDefined()
  })

  it("plan agent allows plan_exit", async () => {
    const agent = await Agent.get("plan")
    const rule = agent.permission.find(
      (r) => r.permission === "plan_exit" && r.action === "allow",
    )
    expect(rule).toBeDefined()
  })

  it("explore agent only allows read-only tools", async () => {
    const agent = await Agent.get("explore")
    // Should have deny-all first, then selective allows
    const denyAll = agent.permission.find(
      (r) => r.permission === "*" && r.action === "deny",
    )
    expect(denyAll).toBeDefined()

    const allowGrep = agent.permission.find(
      (r) => r.permission === "grep" && r.action === "allow",
    )
    const allowRead = agent.permission.find(
      (r) => r.permission === "read" && r.action === "allow",
    )
    expect(allowGrep).toBeDefined()
    expect(allowRead).toBeDefined()
  })

  it("general agent denies todoread/todowrite", async () => {
    const agent = await Agent.get("general")
    const todoDeny = agent.permission.find(
      (r) => r.permission === "todoread" && r.action === "deny",
    )
    const todoWriteDeny = agent.permission.find(
      (r) => r.permission === "todowrite" && r.action === "deny",
    )
    expect(todoDeny).toBeDefined()
    expect(todoWriteDeny).toBeDefined()
  })

  it("Agent.Info schema validates", () => {
    const result = Agent.Info.parse({
      name: "test",
      mode: "subagent",
      permission: [],
      options: {},
    })
    expect(result.name).toBe("test")
    expect(result.mode).toBe("subagent")
  })

  it("Agent.Info schema accepts optional fields", () => {
    const result = Agent.Info.parse({
      name: "test",
      mode: "primary",
      permission: [],
      options: {},
      description: "A test agent",
      temperature: 0.7,
      topP: 0.9,
      prompt: "You are a test agent",
      steps: 10,
      hidden: true,
      variant: "compact",
    })
    expect(result.description).toBe("A test agent")
    expect(result.temperature).toBe(0.7)
    expect(result.steps).toBe(10)
  })

  it("reset clears cached state", async () => {
    // Force lazy evaluation
    await Agent.list()
    Agent.reset()
    // Should be able to call again without error
    const agents = await Agent.list()
    expect(agents).toHaveLength(4)
  })
})
