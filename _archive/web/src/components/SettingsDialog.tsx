import { useState, useEffect, useCallback } from 'react';
import {
  getAvailableProviders,
  getProviderConfigs,
  createProviderConfig,
  updateProviderConfig,
  deleteProviderConfig,
} from '../lib/api';
import type { ProviderInfo, ProviderConfig } from '../types';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type TabId = 'providers' | 'general';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'providers',
    label: '模型配置',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    id: 'general',
    label: '通用',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
];

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('providers');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl mx-4 bg-surface-1 border border-surface-4/60 rounded-2xl shadow-2xl animate-fade-in flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-4/40 flex-shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">设置</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body: Tabs + Content */}
        <div className="flex flex-1 min-h-0">
          {/* Tab sidebar */}
          <div className="w-36 flex-shrink-0 border-r border-surface-4/40 py-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setError(null); setSuccess(null); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'text-accent-light bg-accent-muted font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-status-error-muted border border-status-error-border text-status-error text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-status-success-muted border border-status-success-border text-status-success text-sm">
                {success}
              </div>
            )}

            {activeTab === 'providers' && (
              <ProvidersTab
                onError={setError}
                onSuccess={(msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 2000); }}
              />
            )}
            {activeTab === 'general' && <GeneralTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab: Provider 配置
// ═════════════════════════════════════════════════════════════════════════════

function ProvidersTab({
  onError,
  onSuccess,
}: {
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([]);
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [availRes, configRes] = await Promise.all([
        getAvailableProviders(),
        getProviderConfigs(),
      ]);
      setAvailableProviders(availRes.providers);
      setConfigs(configRes.providers);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async (data: {
    providerId: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    modelId: string;
    isDefault: boolean;
  }) => {
    try {
      await createProviderConfig(data);
      onSuccess('Provider 已添加');
      setShowAddForm(false);
      loadData();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdate = async (id: string, data: Partial<{
    name: string;
    apiKey: string;
    baseUrl: string;
    modelId: string;
    isDefault: boolean;
  }>) => {
    try {
      await updateProviderConfig(id, data);
      onSuccess('配置已更新');
      setEditingId(null);
      loadData();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProviderConfig(id);
      onSuccess('配置已删除');
      loadData();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-5 h-5 border-2 border-surface-5 border-t-accent-light rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">管理 AI 模型的 Provider 配置。标记为默认的配置将用于对话。</p>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dark transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            添加
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <ProviderForm
          availableProviders={availableProviders}
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Configured providers list */}
      {configs.length === 0 && !showAddForm ? (
        <div className="text-center py-8">
          <p className="text-text-muted text-sm">暂无 Provider 配置</p>
          <p className="text-text-faint text-xs mt-1">点击上方添加按钮创建</p>
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map((config) => (
            editingId === config.id ? (
              <ProviderEditForm
                key={config.id}
                config={config}
                availableProviders={availableProviders}
                onSubmit={(data) => handleUpdate(config.id, data)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <ProviderCard
                key={config.id}
                config={config}
                availableProviders={availableProviders}
                onEdit={() => setEditingId(config.id)}
                onDelete={() => handleDelete(config.id)}
                onSetDefault={() => handleUpdate(config.id, { isDefault: true })}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Provider Card ──────────────────────────────────────────────────────────

function ProviderCard({
  config,
  availableProviders,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  config: ProviderConfig;
  availableProviders: ProviderInfo[];
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const providerName = availableProviders.find((p) => p.id === config.providerId)?.name ?? config.providerId;

  return (
    <div className={`border rounded-xl p-4 transition-colors ${config.isDefault ? 'border-accent/40 bg-accent-muted/30' : 'border-surface-4/50 bg-surface-2'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-text-primary">{config.name}</span>
            <span className="text-2xs px-1.5 py-0.5 rounded bg-surface-3 text-text-muted">{providerName}</span>
            {config.isDefault && (
              <span className="text-2xs px-1.5 py-0.5 rounded bg-accent/20 text-accent-light font-medium">默认</span>
            )}
          </div>
          <div className="text-xs text-text-muted space-y-0.5">
            {config.modelId && <div>模型: {config.modelId}</div>}
            {config.baseUrl && <div>URL: {config.baseUrl}</div>}
            {config.apiKey && <div>API Key: {config.apiKey}</div>}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!config.isDefault && (
            <button
              onClick={onSetDefault}
              className="px-2 py-1 rounded-md text-2xs text-text-muted hover:text-accent-light hover:bg-surface-3 transition-colors"
              title="设为默认"
            >
              设为默认
            </button>
          )}
          <button
            onClick={onEdit}
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
            title="编辑"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="px-2 py-1 rounded-md text-2xs text-status-error hover:bg-status-error-muted transition-colors"
              >
                确认
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded-md text-2xs text-text-muted hover:text-text-primary transition-colors"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-status-error hover:bg-surface-3 transition-colors"
              title="删除"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Provider Form (Add) ────────────────────────────────────────────────────

function ProviderForm({
  availableProviders,
  onSubmit,
  onCancel,
}: {
  availableProviders: ProviderInfo[];
  onSubmit: (data: {
    providerId: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    modelId: string;
    isDefault: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const [providerId, setProviderId] = useState(availableProviders[0]?.id ?? '');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelId, setModelId] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedProvider = availableProviders.find((p) => p.id === providerId);

  // Auto-fill name from provider
  useEffect(() => {
    if (selectedProvider && !name) {
      setName(selectedProvider.name);
    }
  }, [selectedProvider, name]);

  const handleSubmit = async () => {
    if (!providerId || !name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ providerId, name: name.trim(), apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), modelId: modelId.trim(), isDefault });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-accent/30 rounded-xl p-4 bg-accent-muted/10 space-y-4">
      <h3 className="text-sm font-medium text-text-primary">添加 Provider 配置</h3>

      <Field label="Provider 类型">
        <select
          value={providerId}
          onChange={(e) => { setProviderId(e.target.value); setName(''); }}
          className="field-input"
        >
          {availableProviders.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {p.description}</option>
          ))}
        </select>
      </Field>

      <Field label="配置名称" hint="用于在列表中区分不同配置">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={selectedProvider?.name ?? '输入名称'}
          className="field-input"
        />
      </Field>

      <Field label="API Key" hint={selectedProvider?.envKey ? `也可设置环境变量 ${selectedProvider.envKey}` : undefined}>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="field-input"
        />
      </Field>

      {providerId === 'openai-compatible' && (
        <Field label="Base URL" hint="自定义 OpenAI 兼容接口的地址">
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="field-input"
          />
        </Field>
      )}

      <Field label="模型 ID" hint="如 gpt-4o, claude-sonnet-4-20250514, gemini-2.5-pro 等">
        <input
          type="text"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="输入模型 ID"
          className="field-input"
        />
      </Field>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="w-4 h-4 rounded border-surface-4 text-accent focus:ring-accent/30"
        />
        <span className="text-sm text-text-secondary">设为默认 Provider</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !providerId || !name.trim()}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dark disabled:opacity-40 transition-colors"
        >
          {saving ? '添加中...' : '添加'}
        </button>
      </div>
    </div>
  );
}

// ─── Provider Edit Form ─────────────────────────────────────────────────────

function ProviderEditForm({
  config,
  availableProviders,
  onSubmit,
  onCancel,
}: {
  config: ProviderConfig;
  availableProviders: ProviderInfo[];
  onSubmit: (data: Partial<{
    name: string;
    apiKey: string;
    baseUrl: string;
    modelId: string;
    isDefault: boolean;
  }>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(config.name);
  const [apiKey, setApiKey] = useState(config.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(config.baseUrl ?? '');
  const [modelId, setModelId] = useState(config.modelId ?? '');
  const [isDefault, setIsDefault] = useState(config.isDefault);
  const [saving, setSaving] = useState(false);

  const selectedProvider = availableProviders.find((p) => p.id === config.providerId);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = { name: name.trim(), modelId: modelId.trim(), isDefault };
      // Only send apiKey if it was changed (doesn't contain mask)
      if (apiKey && !apiKey.includes('****')) {
        data.apiKey = apiKey.trim();
      }
      if (config.providerId === 'openai-compatible') {
        data.baseUrl = baseUrl.trim();
      }
      await onSubmit(data as Partial<{ name: string; apiKey: string; baseUrl: string; modelId: string; isDefault: boolean }>);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-accent/30 rounded-xl p-4 bg-accent-muted/10 space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-text-primary">编辑配置</h3>
        <span className="text-2xs px-1.5 py-0.5 rounded bg-surface-3 text-text-muted">{selectedProvider?.name ?? config.providerId}</span>
      </div>

      <Field label="配置名称">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field-input"
        />
      </Field>

      <Field label="API Key" hint={selectedProvider?.envKey ? `也可设置环境变量 ${selectedProvider.envKey}` : undefined}>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onFocus={() => { if (apiKey.includes('****')) setApiKey(''); }}
          placeholder="留空不修改"
          className="field-input"
        />
      </Field>

      {config.providerId === 'openai-compatible' && (
        <Field label="Base URL">
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="field-input"
          />
        </Field>
      )}

      <Field label="模型 ID">
        <input
          type="text"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="输入模型 ID"
          className="field-input"
        />
      </Field>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="w-4 h-4 rounded border-surface-4 text-accent focus:ring-accent/30"
        />
        <span className="text-sm text-text-secondary">设为默认 Provider</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !name.trim()}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dark disabled:opacity-40 transition-colors"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab: 通用设置
// ═════════════════════════════════════════════════════════════════════════════

function GeneralTab() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-muted">通用设置，更多选项即将到来。</p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Shared
// ═════════════════════════════════════════════════════════════════════════════

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-2xs text-text-faint mt-1">{hint}</p>}
    </div>
  );
}
