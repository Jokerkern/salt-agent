import { Hono } from "hono"
import { Permission } from "../../permission/permission.js"
import { lazy } from "../../util/lazy.js"

export const PermissionRoutes = lazy(() =>
  new Hono()
    // -----------------------------------------------------------------------
    // Respond to permission request
    // -----------------------------------------------------------------------
    .post("/:requestID/reply", async (c) => {
      const requestID = c.req.param("requestID")
      const body = await c.req.json<{ reply: Permission.Reply; message?: string }>()
      Permission.reply({
        requestID,
        reply: body.reply,
        message: body.message,
      })
      return c.json(true)
    })

    // -----------------------------------------------------------------------
    // List pending permissions
    // -----------------------------------------------------------------------
    .get("/", async (c) => {
      const permissions = Permission.list()
      return c.json(permissions)
    }),
)
