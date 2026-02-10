import { useState, useEffect, useCallback } from 'react';
import { getSettings, saveSettings, fetchModels } from '../lib/api';
import type { ModelInfo } from '../lib/api';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type TabId = 'general' | 'api';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'general',
    label: '通用',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    id: 'api',
    label: 'API 配置',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
];

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  // ─── API settings state ────────────────────────────────────────────
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  // ─── UI state ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ─── Load settings ─────────────────────────────────────────────────
  const loadCurrentSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSettings();
      setBaseUrl(data.baseUrl);
      setApiKey(data.apiKey);
      setModel(data.model);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadCurrentSettings();
      setModels([]);
      setSuccess(null);
      setError(null);
    }
  }, [open, loadCurrentSettings]);

  // ─── Actions ───────────────────────────────────────────────────────
  const handleFetchModels = async () => {
    setError(null);
    setSuccess(null);
    if (!baseUrl.trim()) { setError('请填写 Base URL'); return; }

    try {
      setFetchingModels(true);
      const keyToSend = apiKey.includes('***') ? undefined : apiKey;
      const data = await fetchModels(baseUrl.trim(), keyToSend);
      setModels(data.models);
      if (data.models.length === 0) {
        setError('未找到可用模型');
      } else if (!model || !data.models.some((m) => m.id === model)) {
        setModel(data.models[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setModels([]);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await saveSettings({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
      });
      setSuccess('设置已保存');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

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
            {/* Messages */}
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

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-surface-5 border-t-accent-light rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {activeTab === 'general' && <GeneralTab />}
                {activeTab === 'api' && (
                  <ApiTab
                    baseUrl={baseUrl} setBaseUrl={setBaseUrl}
                    apiKey={apiKey} setApiKey={setApiKey}
                    model={model} setModel={setModel}
                    models={models}
                    fetchingModels={fetchingModels}
                    onFetchModels={handleFetchModels}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-4/40 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dark disabled:opacity-40 transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Tab: API 配置
// ═════════════════════════════════════════════════════════════════════════════

function ApiTab({
  baseUrl, setBaseUrl,
  apiKey, setApiKey,
  model, setModel,
  models,
  fetchingModels,
  onFetchModels,
}: {
  baseUrl: string; setBaseUrl: (v: string) => void;
  apiKey: string; setApiKey: (v: string) => void;
  model: string; setModel: (v: string) => void;
  models: ModelInfo[];
  fetchingModels: boolean;
  onFetchModels: () => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-muted">配置 OpenAI 兼容的 API 接口。填写 Base URL 和 API Key 后点击获取模型列表。</p>

      <Field label="Base URL" hint="如 https://api.openai.com 或其他兼容接口">
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com"
          className="field-input"
        />
      </Field>

      <Field label="API Key">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onFocus={() => { if (apiKey.includes('***')) setApiKey(''); }}
          placeholder="sk-..."
          className="field-input"
        />
      </Field>

      <Field label="模型">
        <div className="flex gap-2">
          {models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="field-input flex-1"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="填写模型 ID 或点击获取列表"
              className="field-input flex-1"
            />
          )}
          <button
            onClick={onFetchModels}
            disabled={fetchingModels || !baseUrl.trim()}
            className="flex-shrink-0 px-3 py-2 rounded-lg border border-surface-4/60 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3/50 disabled:opacity-40 transition-all flex items-center gap-1.5"
          >
            {fetchingModels ? (
              <div className="w-3.5 h-3.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
            )}
            获取
          </button>
        </div>
      </Field>
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
