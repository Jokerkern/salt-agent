import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Modal,
  Input,
  Button,
  Space,
  Tag,
  Typography,
  Flex,
  message,
  Tabs,
  Select,
  Divider,
  Empty,
  Form,
} from "antd"
import {
  CheckCircleOutlined,
  KeyOutlined,
  DeleteOutlined,
  RobotOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  PlusOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons"
import { api } from "../../lib/api"
import type { ProviderInfo, ProviderModel, ConfigInfo, ConfigProvider } from "../../lib/types"

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Main SettingsDialog
// ---------------------------------------------------------------------------

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [connected, setConnected] = useState<string[]>([])
  const [config, setConfig] = useState<ConfigInfo>({})
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [providerData, configData] = await Promise.all([
        api.provider.list(),
        api.config.get(),
      ])
      setProviders(providerData.all)
      setConnected(providerData.connected)
      setConfig(configData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) reload()
  }, [open, reload])

  return (
    <Modal
      title="设置"
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      styles={{ body: { paddingTop: 8 } }}
    >
      <Tabs
        defaultActiveKey="model"
        items={[
          {
            key: "model",
            label: (
              <span>
                <RobotOutlined style={{ marginRight: 6 }} />
                模型
              </span>
            ),
            children: (
              <ModelTab
                providers={providers}
                connected={connected}
                config={config}
                loading={loading}
                onConfigChanged={reload}
              />
            ),
          },
          {
            key: "providers",
            label: (
              <span>
                <ApiOutlined style={{ marginRight: 6 }} />
                服务商
              </span>
            ),
            children: (
              <ProvidersTab
                providers={providers}
                connected={connected}
                config={config}
                loading={loading}
                onUpdated={reload}
              />
            ),
          },
        ]}
      />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Model Tab
// ---------------------------------------------------------------------------

interface ModelOption {
  value: string
  label: string
  provider: string
  model: ProviderModel
}

function ModelTab({
  providers,
  connected,
  config,
  loading,
  onConfigChanged,
}: {
  providers: ProviderInfo[]
  connected: string[]
  config: ConfigInfo
  loading: boolean
  onConfigChanged: () => void
}) {
  const [saving, setSaving] = useState(false)

  const modelOptions = useMemo(() => {
    const options: ModelOption[] = []
    for (const p of providers) {
      if (!connected.includes(p.id)) continue
      for (const m of Object.values(p.models)) {
        options.push({
          value: `${p.id}/${m.id}`,
          label: m.name || m.id,
          provider: p.name || p.id,
          model: m,
        })
      }
    }
    return options
  }, [providers, connected])

  const selectOptions = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {}
    for (const opt of modelOptions) {
      if (!groups[opt.provider]) groups[opt.provider] = []
      groups[opt.provider]!.push(opt)
    }
    return Object.entries(groups).map(([provider, opts]) => ({
      label: provider,
      options: opts.map((o) => ({
        value: o.value,
        label: (
          <Flex justify="space-between" align="center">
            <span>{o.label}</span>
            <Space size={4}>
              {o.model.capabilities.reasoning && (
                <Tag
                  bordered={false}
                  style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", margin: 0 }}
                >
                  推理
                </Tag>
              )}
              {o.model.capabilities.toolcall && (
                <Tag
                  bordered={false}
                  style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", margin: 0 }}
                >
                  工具
                </Tag>
              )}
            </Space>
          </Flex>
        ),
      })),
    }))
  }, [modelOptions])

  const handleModelChange = async (field: "model" | "small_model", value: string | undefined) => {
    setSaving(true)
    try {
      await api.config.update({ [field]: value ?? "" })
      message.success(`${field === "model" ? "默认模型" : "轻量模型"}已更新`)
      onConfigChanged()
    } catch {
      message.error("更新模型失败")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Typography.Text type="secondary">加载中...</Typography.Text>
  }

  if (connected.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span>
            暂无已连接的服务商。
            <br />
            请先前往<strong>服务商</strong>标签页添加 API Key。
          </span>
        }
      />
    )
  }

  return (
    <Flex vertical gap={20}>
      <div>
        <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
          <RobotOutlined />
          <Typography.Text strong>默认模型</Typography.Text>
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
          用于对话和编码任务的主要模型。
        </Typography.Text>
        <Select
          style={{ width: "100%" }}
          placeholder="选择默认模型..."
          value={config.model || undefined}
          onChange={(v) => handleModelChange("model", v)}
          options={selectOptions}
          showSearch
          optionFilterProp="value"
          loading={saving}
          allowClear
          notFoundContent="暂无可用模型"
        />
      </div>

      <Divider style={{ margin: 0 }} />

      <div>
        <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
          <ThunderboltOutlined />
          <Typography.Text strong>轻量模型</Typography.Text>
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
          用于摘要和轻量任务的快速模型。
        </Typography.Text>
        <Select
          style={{ width: "100%" }}
          placeholder="选择轻量模型..."
          value={config.small_model || undefined}
          onChange={(v) => handleModelChange("small_model", v)}
          options={selectOptions}
          showSearch
          optionFilterProp="value"
          loading={saving}
          allowClear
          notFoundContent="暂无可用模型"
        />
      </div>

      {(config.model || config.small_model) && (
        <>
          <Divider style={{ margin: 0 }} />
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              当前配置：
            </Typography.Text>
            <div style={{ marginTop: 4 }}>
              {config.model && (
                <Tag color="blue" style={{ marginBottom: 4 }}>
                  默认: {config.model}
                </Tag>
              )}
              {config.small_model && (
                <Tag color="cyan" style={{ marginBottom: 4 }}>
                  轻量: {config.small_model}
                </Tag>
              )}
            </div>
          </div>
        </>
      )}
    </Flex>
  )
}

// ---------------------------------------------------------------------------
// Providers Tab
// ---------------------------------------------------------------------------

function ProvidersTab({
  providers,
  connected,
  config,
  loading,
  onUpdated,
}: {
  providers: ProviderInfo[]
  connected: string[]
  config: ConfigInfo
  loading: boolean
  onUpdated: () => void
}) {
  const [showCustomForm, setShowCustomForm] = useState(false)

  if (loading) {
    return <Typography.Text type="secondary">加载中...</Typography.Text>
  }

  const connectedProviders = providers.filter((p) => connected.includes(p.id))
  const unconnectedProviders = providers.filter((p) => !connected.includes(p.id))
  const customProviderIds = Object.keys(config.provider ?? {})

  return (
    <Flex vertical gap={16}>
      {/* Connected */}
      {connectedProviders.length > 0 && (
        <div>
          <Typography.Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
            已连接 ({connectedProviders.length})
          </Typography.Text>
          <Flex vertical gap={10}>
            {connectedProviders.map((p) => (
              <ProviderItem
                key={p.id}
                provider={p}
                isConnected
                isCustom={customProviderIds.includes(p.id)}
                config={config}
                onUpdated={onUpdated}
              />
            ))}
          </Flex>
        </div>
      )}

      {/* Unconnected */}
      {unconnectedProviders.length > 0 && (
        <div>
          {connectedProviders.length > 0 && <Divider style={{ margin: "4px 0 12px" }} />}
          <Typography.Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
            可用 ({unconnectedProviders.length})
          </Typography.Text>
          <Flex vertical gap={10}>
            {unconnectedProviders.map((p) => (
              <ProviderItem
                key={p.id}
                provider={p}
                isConnected={false}
                isCustom={customProviderIds.includes(p.id)}
                config={config}
                onUpdated={onUpdated}
              />
            ))}
          </Flex>
        </div>
      )}

      {/* Add custom provider */}
      <Divider style={{ margin: "4px 0 0" }} />
      {showCustomForm ? (
        <CustomProviderForm
          config={config}
          onSaved={() => {
            setShowCustomForm(false)
            onUpdated()
          }}
          onCancel={() => setShowCustomForm(false)}
        />
      ) : (
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          block
          onClick={() => setShowCustomForm(true)}
        >
          添加自定义服务商
        </Button>
      )}
    </Flex>
  )
}

// ---------------------------------------------------------------------------
// Provider Item
// ---------------------------------------------------------------------------

function ProviderItem({
  provider,
  isConnected,
  isCustom,
  config,
  onUpdated,
}: {
  provider: ProviderInfo
  isConnected: boolean
  isCustom: boolean
  config: ConfigInfo
  onUpdated: () => void
}) {
  const [apiKey, setApiKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const modelCount = Object.keys(provider.models).length

  const handleSave = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    try {
      await api.auth.set(provider.id, { type: "api", key: apiKey.trim() })
      setApiKey("")
      setExpanded(false)
      message.success(`${provider.name} 密钥已保存`)
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    await api.auth.delete(provider.id)
    message.info(`${provider.name} 密钥已移除`)
    onUpdated()
  }

  const handleDeleteCustom = async () => {
    try {
      // Remove from config
      const updatedProviders = { ...(config.provider ?? {}) }
      delete updatedProviders[provider.id]
      await api.config.update({ provider: updatedProviders })
      // Also remove auth
      try { await api.auth.delete(provider.id) } catch { /* ignore */ }
      message.success(`${provider.name} 已删除`)
      onUpdated()
    } catch {
      message.error("删除服务商失败")
    }
  }

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${isConnected ? "var(--ant-color-success-border)" : "var(--ant-color-border)"}`,
        background: isConnected ? "var(--ant-color-success-bg)" : undefined,
      }}
    >
      {/* Header */}
      <Flex justify="space-between" align="center">
        <Space>
          <Typography.Text strong>{provider.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11, fontFamily: "monospace" }}>
            {provider.id}
          </Typography.Text>
          {modelCount > 0 && (
            <Tag bordered={false} style={{ fontSize: 11 }}>
              {modelCount} 个模型
            </Tag>
          )}
          {isCustom && (
            <Tag bordered={false} color="purple" style={{ fontSize: 11 }}>
              自定义
            </Tag>
          )}
        </Space>
        <Space size={4}>
          {isConnected ? (
            <>
              <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0 }}>
                已连接
              </Tag>
              {isCustom ? (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={handleDeleteCustom} />
              ) : (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={handleRemove} />
              )}
            </>
          ) : (
            <Space size={4}>
              <Button size="small" type="primary" ghost onClick={() => setExpanded(!expanded)}>
                {expanded ? "取消" : "连接"}
              </Button>
              {isCustom && (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={handleDeleteCustom} />
              )}
            </Space>
          )}
        </Space>
      </Flex>

      {/* Env hints */}
      {provider.env.length > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
          环境变量: {provider.env.join(", ")}
        </Typography.Text>
      )}

      {/* API key input */}
      {(isConnected || expanded) && (
        <Space.Compact style={{ width: "100%", marginTop: 8 }}>
          <Input.Password
            size="small"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={isConnected ? "更新 API 密钥..." : "输入 API 密钥..."}
            prefix={<KeyOutlined />}
            onPressEnter={handleSave}
          />
          <Button
            size="small"
            type="primary"
            loading={saving}
            onClick={handleSave}
            disabled={!apiKey.trim()}
          >
            保存
          </Button>
        </Space.Compact>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom Provider Form
// ---------------------------------------------------------------------------

interface CustomFormValues {
  id: string
  name: string
  baseURL: string
  apiKey: string
  models: Array<{ id: string; name: string }>
}

function CustomProviderForm({
  config,
  onSaved,
  onCancel,
}: {
  config: ConfigInfo
  onSaved: () => void
  onCancel: () => void
}) {
  const [form] = Form.useForm<CustomFormValues>()
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (values: CustomFormValues) => {
    const id = values.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")

    if (!id) {
      message.error("请输入服务商 ID")
      return
    }

    // Build models map
    const models: Record<string, Record<string, unknown>> = {}
    for (const m of values.models ?? []) {
      if (m.id?.trim()) {
        models[m.id.trim()] = { name: m.name?.trim() || m.id.trim() }
      }
    }

    if (Object.keys(models).length === 0) {
      message.error("请至少添加一个模型")
      return
    }

    const providerConfig: ConfigProvider = {
      name: values.name?.trim() || id,
      npm: "@ai-sdk/openai-compatible",
      options: {
        baseURL: values.baseURL.trim(),
      },
      models,
    }

    setSaving(true)
    try {
      // Update config with new provider
      const updatedProviders = { ...(config.provider ?? {}), [id]: providerConfig }
      await api.config.update({ provider: updatedProviders })

      // Set API key if provided
      if (values.apiKey?.trim()) {
        await api.auth.set(id, { type: "api", key: values.apiKey.trim() })
      }

      message.success(`${providerConfig.name} 已添加`)
      form.resetFields()
      onSaved()
    } catch {
      message.error("添加服务商失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        border: "1px solid var(--ant-color-primary-border)",
        background: "var(--ant-color-primary-bg)",
      }}
    >
      <Typography.Text strong style={{ display: "block", marginBottom: 12 }}>
        添加自定义服务商（OpenAI 兼容）
      </Typography.Text>

      <Form
        form={form}
        layout="vertical"
        size="small"
        onFinish={handleSubmit}
        initialValues={{ models: [{ id: "", name: "" }] }}
      >
        <Flex gap={12}>
          <Form.Item
            name="id"
            label="服务商 ID"
            rules={[{ required: true, message: "必填" }]}
            style={{ flex: 1, marginBottom: 8 }}
          >
            <Input placeholder="例如: deepseek" />
          </Form.Item>
          <Form.Item
            name="name"
            label="显示名称"
            style={{ flex: 1, marginBottom: 8 }}
          >
            <Input placeholder="例如: DeepSeek" />
          </Form.Item>
        </Flex>

        <Form.Item
          name="baseURL"
          label="Base URL"
          rules={[{ required: true, message: "必填" }]}
          style={{ marginBottom: 8 }}
        >
          <Input placeholder="例如: https://api.deepseek.com/v1" />
        </Form.Item>

        <Form.Item
          name="apiKey"
          label="API 密钥"
          style={{ marginBottom: 8 }}
        >
          <Input.Password placeholder="输入 API 密钥（可选，稍后也可设置）" prefix={<KeyOutlined />} />
        </Form.Item>

        <Form.Item label="模型列表" style={{ marginBottom: 8 }}>
          <Form.List name="models">
            {(fields, { add, remove }) => (
              <Flex vertical gap={6}>
                {fields.map((field) => (
                  <Flex key={field.key} gap={8} align="start">
                    <Form.Item
                      {...field}
                      name={[field.name, "id"]}
                      rules={[{ required: true, message: "必填" }]}
                      style={{ flex: 1, marginBottom: 0 }}
                    >
                      <Input placeholder="模型 ID，例如: deepseek-chat" />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, "name"]}
                      style={{ flex: 1, marginBottom: 0 }}
                    >
                      <Input placeholder="显示名称（可选）" />
                    </Form.Item>
                    {fields.length > 1 && (
                      <Button
                        type="text"
                        danger
                        icon={<MinusCircleOutlined />}
                        onClick={() => remove(field.name)}
                        style={{ marginTop: 1 }}
                      />
                    )}
                  </Flex>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add()}
                  icon={<PlusOutlined />}
                  style={{ width: "100%" }}
                >
                  添加模型
                </Button>
              </Flex>
            )}
          </Form.List>
        </Form.Item>

        <Flex justify="end" gap={8} style={{ marginTop: 12 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存
          </Button>
        </Flex>
      </Form>
    </div>
  )
}
