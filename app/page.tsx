"use client";

import { useEffect, useMemo, useState } from "react";
import type { JourneyBlueprint } from "../lib/martech";

type HealthPayload = {
  status?: string;
  service?: string;
  sfmc?: Record<string, boolean>;
  timestamp?: string;
};

type BriefingForm = {
  name: string;
  objective: string;
  audience: string;
  offer: string;
  channels: string[];
  entryCriteria: string;
  exitCriteria: string;
  businessRules: string;
  dataNeeds: string;
  kpis: string;
  requester: string;
  technicalOwner: string;
  approver: string;
  notes: string;
};

const stages = [
  ["Demanda", "Marketing registra o caso de uso e prioridade."],
  ["Briefing", "ICA estrutura objetivo, público, oferta, canais e KPIs."],
  ["Discovery", "Contexto de jornadas existentes e aprendizados anteriores."],
  ["Dados", "Validação de DEs, campos, consentimento, chaves e Data Cloud."],
  ["Estratégia IA", "Blueprint completo da jornada, regras e hipóteses."],
  ["Validação técnica", "IBM revisa arquitetura, SQL, automações e limites."],
  ["Aprovação", "Marketing aprova público, oferta, conteúdo, KPIs e execução."],
  ["Draft SFMC", "Gateway cria somente o draft após aprovação explícita."],
  ["Ajustes + QA", "Consultoria executa refinamentos e testes manuais."],
  ["Go-live", "Publicação controlada, monitoramento e rollback."],
  ["Aprendizado", "Resultados viram contexto para próximas jornadas."],
] as const;

const channelOptions = ["Email", "SMS", "WhatsApp", "MobilePush", "Web"];

const emptyForm: BriefingForm = {
  name: "",
  objective: "",
  audience: "",
  offer: "",
  channels: ["Email"],
  entryCriteria: "",
  exitCriteria: "",
  businessRules: "",
  dataNeeds: "",
  kpis: "",
  requester: "",
  technicalOwner: "",
  approver: "",
  notes: "",
};

const sampleForm: BriefingForm = {
  name: "Upgrade de plano de internet residencial",
  objective: "Aumentar a conversão de clientes elegíveis para um plano superior de internet residencial",
  audience: "Clientes residenciais ativos, adimplentes e elegíveis a upgrade",
  offer: "Upgrade para maior velocidade com condição comercial personalizada",
  channels: ["Email", "WhatsApp", "SMS"],
  entryCriteria:
    "Cliente ativo, elegível à oferta, com consentimento válido e sem conversão recente",
  exitCriteria:
    "Conversão, perda de elegibilidade, opt-out, fim da oferta ou limite de contatos",
  businessRules:
    "Respeitar consentimento por canal, excluir convertidos antes de cada contato e aplicar pressão máxima de comunicação",
  dataNeeds:
    "ContactKey, plano atual, velocidade atual, elegibilidade, oferta disponível, consentimento, histórico de contato, conversão",
  kpis: "conversão, receita incremental, taxa de resposta, opt-out",
  requester: "Marketing",
  technicalOwner: "Consultoria MarTech IBM",
  approver: "Responsável de Marketing",
  notes:
    "Usar jornadas existentes como referência. Data Cloud pode participar da segmentação e ativação conforme disponibilidade dos dados.",
};

function statusLabel(status: "ready" | "warning" | "blocked") {
  if (status === "ready") return "Pronto";
  if (status === "warning") return "Revisar";
  return "Bloqueado";
}

function statusClass(status: "ready" | "warning" | "blocked") {
  if (status === "ready") return "green";
  if (status === "warning") return "yellow";
  return "red";
}

export default function Home() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [form, setForm] = useState<BriefingForm>(sampleForm);
  const [blueprint, setBlueprint] = useState<JourneyBlueprint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/health", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as HealthPayload;
        if (!response.ok) throw new Error("Health endpoint indisponível");
        if (active) setHealth(data);
      })
      .catch(() => {
        if (active) setHealthError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const configuredCount = useMemo(
    () => Object.values(health?.sfmc ?? {}).filter(Boolean).length,
    [health],
  );
  const configTotal = useMemo(
    () => Object.keys(health?.sfmc ?? {}).length,
    [health],
  );
  const sfmcReady = configTotal > 0 && configuredCount === configTotal;

  function updateField<K extends keyof BriefingForm>(key: K, value: BriefingForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleChannel(channel: string) {
    setForm((current) => ({
      ...current,
      channels: current.channels.includes(channel)
        ? current.channels.filter((item) => item !== channel)
        : [...current.channels, channel],
    }));
  }

  async function generateBlueprint() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          dataNeeds: form.dataNeeds,
          kpis: form.kpis,
        }),
      });
      const data = (await response.json()) as JourneyBlueprint & {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message || "Não foi possível gerar o blueprint.");
      }
      setBlueprint(data);
      setTimeout(() => {
        document.getElementById("blueprint")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>Bluewolf MarTech Journey Factory</div>
        </div>
        <div className="topbar-meta">
          <span className={`status-dot ${sfmcReady ? "ok" : healthError ? "warn" : ""}`} />
          <span>
            {healthError
              ? "Health indisponível"
              : sfmcReady
                ? "Gateway configurado"
                : health
                  ? `${configuredCount}/${configTotal} configs SFMC`
                  : "Validando gateway..."}
          </span>
          <span>•</span>
          <span>IBM Consulting Advantage + Salesforce</span>
        </div>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="eyebrow">POC MARTECH • GOVERNANÇA + IA + EXECUÇÃO CONTROLADA</div>
          <h1>Da demanda de Marketing ao draft técnico no Salesforce Marketing Cloud.</h1>
          <p>
            A aplicação não é apenas um gerador de jornada ou SQL. Ela organiza a esteira
            inteira: briefing, contexto histórico, validação de dados, estratégia assistida
            por IA, revisão técnica, aprovação de negócio, construção controlada, QA,
            publicação e aprendizado contínuo.
          </p>
          <div className="hero-tags">
            <span className="tag">IBM Consulting Advantage</span>
            <span className="tag">MCP Streamable HTTP</span>
            <span className="tag">Marketing Cloud Engagement</span>
            <span className="tag">Data Cloud — extension point</span>
            <span className="tag">Human-in-the-loop</span>
            <span className="tag">14 ferramentas MCP</span>
          </div>
        </div>
      </section>

      <section className="section-wrap" style={{ paddingTop: 24 }}>
        <div className="card process-card">
          <h2>Esteira operacional completa</h2>
          <p>
            Cada etapa tem um gate de governança. A IA acelera a estratégia e o desenho;
            o consultor e o cliente mantêm a responsabilidade sobre dados, aprovação e go-live.
          </p>
          <div className="process-grid">
            {stages.map(([title, description], index) => (
              <div className="stage" key={title}>
                <span className="stage-number">{index + 1}</span>
                <h4>{title}</h4>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="main-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>1. Briefing da demanda</h2>
              <p>
                Preencha como o time de Marketing faria no início da solicitação. A aplicação
                transforma o briefing em um blueprint para revisão técnica.
              </p>
            </div>
            <span className="badge">INTAKE</span>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field full">
                <label>Nome da iniciativa *</label>
                <input
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="Ex.: Upgrade de plano residencial"
                />
              </div>
              <div className="field full">
                <label>Objetivo de negócio *</label>
                <textarea
                  value={form.objective}
                  onChange={(event) => updateField("objective", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Público / audiência *</label>
                <textarea
                  value={form.audience}
                  onChange={(event) => updateField("audience", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Oferta / proposta de valor *</label>
                <textarea
                  value={form.offer}
                  onChange={(event) => updateField("offer", event.target.value)}
                />
              </div>
              <div className="field full">
                <label>Canais *</label>
                <div className="checkbox-row">
                  {channelOptions.map((channel) => (
                    <label className="check-chip" key={channel}>
                      <input
                        type="checkbox"
                        checked={form.channels.includes(channel)}
                        onChange={() => toggleChannel(channel)}
                      />
                      {channel}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Critério de entrada</label>
                <textarea
                  value={form.entryCriteria}
                  onChange={(event) => updateField("entryCriteria", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Critério de saída</label>
                <textarea
                  value={form.exitCriteria}
                  onChange={(event) => updateField("exitCriteria", event.target.value)}
                />
              </div>
              <div className="field full">
                <label>Regras de negócio</label>
                <textarea
                  value={form.businessRules}
                  onChange={(event) => updateField("businessRules", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Dados necessários — separados por vírgula</label>
                <textarea
                  value={form.dataNeeds}
                  onChange={(event) => updateField("dataNeeds", event.target.value)}
                />
              </div>
              <div className="field">
                <label>KPIs — separados por vírgula</label>
                <textarea
                  value={form.kpis}
                  onChange={(event) => updateField("kpis", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Solicitante</label>
                <input
                  value={form.requester}
                  onChange={(event) => updateField("requester", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Responsável técnico</label>
                <input
                  value={form.technicalOwner}
                  onChange={(event) => updateField("technicalOwner", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Aprovador de negócio</label>
                <input
                  value={form.approver}
                  onChange={(event) => updateField("approver", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Observações</label>
                <input
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                />
              </div>
            </div>

            <div className="actions">
              <button className="primary" onClick={generateBlueprint} disabled={loading}>
                {loading ? "Gerando blueprint..." : "Gerar estratégia completa"}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setForm(sampleForm);
                  setBlueprint(null);
                  setError("");
                }}
              >
                Carregar exemplo
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setForm(emptyForm);
                  setBlueprint(null);
                  setError("");
                }}
              >
                Limpar
              </button>
            </div>
            {error ? <div className="error-box">{error}</div> : null}

            {blueprint ? (
              <div className="blueprint" id="blueprint">
                <div className="blueprint-head">
                  <div>
                    <h3>2. Blueprint gerado para validação</h3>
                    <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
                      {blueprint.blueprintId} • versão {blueprint.version}
                    </p>
                  </div>
                  <span className="badge">{blueprint.status}</span>
                </div>

                <div className="summary-grid">
                  <div className="summary-box">
                    <span>Hipótese</span>
                    <p>{blueprint.strategy.hypothesis}</p>
                  </div>
                  <div className="summary-box">
                    <span>Entrada</span>
                    <p>{blueprint.strategy.entryMoment}</p>
                  </div>
                  <div className="summary-box">
                    <span>Journey Key sugerida</span>
                    <p>{blueprint.journeyDesign.keySuggestion}</p>
                  </div>
                </div>

                <div className="blueprint-section">
                  <h4>Desenho da jornada</h4>
                  <div className="journey-flow">
                    {blueprint.journeyDesign.steps.map((step) => (
                      <div className="journey-step" key={`${step.order}-${step.name}`}>
                        <span className="type">
                          {step.order}. {step.type}
                        </span>
                        <strong>{step.name}</strong>
                        <p>{step.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="blueprint-section">
                  <h4>Validação antes de construir</h4>
                  <div className="validation-list">
                    {blueprint.validation.map((item) => (
                      <div className="validation-item" key={item.id}>
                        <strong>
                          {item.label}
                          <span className={`badge ${statusClass(item.status)}`}>
                            {statusLabel(item.status)}
                          </span>
                        </strong>
                        <p>{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="blueprint-section">
                  <h4>Plano de dados</h4>
                  <div className="summary-grid">
                    <div className="summary-box">
                      <span>Atributos</span>
                      <p>{blueprint.dataPlan.requiredAttributes.join(", ")}</p>
                    </div>
                    <div className="summary-box">
                      <span>Fontes candidatas</span>
                      <p>{blueprint.dataPlan.candidateSources.join(" • ")}</p>
                    </div>
                    <div className="summary-box">
                      <span>Papel do Data Cloud</span>
                      <p>{blueprint.dataPlan.dataCloudRole.join(" • ")}</p>
                    </div>
                  </div>
                </div>

                <div className="blueprint-section">
                  <h4>SQL / Automação — drafts para revisão humana</h4>
                  {blueprint.automationPlan.queries.map((query) => (
                    <div key={query.name} style={{ marginBottom: 10 }}>
                      <strong style={{ fontSize: 13 }}>{query.name}</strong>
                      <p style={{ color: "var(--muted)", fontSize: 12 }}>{query.purpose}</p>
                      <pre className="code-box">{query.sqlDraft}</pre>
                    </div>
                  ))}
                </div>

                <div className="blueprint-section">
                  <h4>Próximas ações</h4>
                  <ol style={{ paddingLeft: 22, lineHeight: 1.7, color: "var(--muted)" }}>
                    {blueprint.nextActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="side-stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h3>Integrações</h3>
                <p>Visão do control plane atual.</p>
              </div>
            </div>
            <div className="card-body">
              <div className="integration-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="integration-card">
                  <strong>IBM Consulting Advantage</strong>
                  <span>Cliente MCP / agente / interface de IA</span>
                  <div className="integration-state ok">
                    <span className="status-dot ok" /> MCP disponível
                  </div>
                </div>
                <div className="integration-card">
                  <strong>Salesforce Marketing Cloud</strong>
                  <span>Journeys, Data Extensions, Automations e draft controlado</span>
                  <div className={`integration-state ${sfmcReady ? "ok" : "warn"}`}>
                    <span className={`status-dot ${sfmcReady ? "ok" : "warn"}`} />
                    {sfmcReady
                      ? "Variáveis configuradas"
                      : health
                        ? `${configuredCount}/${configTotal} variáveis presentes`
                        : "Aguardando health"}
                  </div>
                </div>
                <div className="integration-card">
                  <strong>Salesforce Data Cloud</strong>
                  <span>DLO/DMO, segmentação, identidade e ativação</span>
                  <div className="integration-state warn">
                    <span className="status-dot warn" /> Extension point — conector separado
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h3>Guardrails</h3>
                <p>O acelerador não substitui governança.</p>
              </div>
            </div>
            <div className="card-body guardrail-list">
              {[
                ["01", "Sem credenciais no output", "Tokens e secrets nunca são retornados pelas tools."],
                ["02", "Read-first", "O agente consulta contexto real antes de propor construção."],
                ["03", "Human-in-the-loop", "Dados, segmentação e arquitetura precisam de validação técnica."],
                ["04", "Draft protegido", "Escrita exige approved=true, dryRun=false e referência de aprovação."],
                ["05", "Sem auto-publish", "Criação de draft não publica nem ativa Journey Builder."],
                ["06", "Contexto vira aprendizado", "Resultados e jornadas aprovadas alimentam decisões futuras."],
              ].map(([icon, title, description]) => (
                <div className="guardrail" key={title}>
                  <span className="guardrail-icon">{icon}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h3>Como usar no ICA</h3>
                <p>Fluxo recomendado para cada nova demanda.</p>
              </div>
            </div>
            <div className="card-body capability-list">
              {[
                ["A", "1. Diagnóstico", "mcp_ping → sfmc_configuration_status → sfmc_health"],
                ["B", "2. Contexto", "martech_context_snapshot"],
                ["C", "3. Briefing", "martech_validate_briefing"],
                ["D", "4. Estratégia", "martech_generate_blueprint"],
                ["E", "5. Revisão", "Consultor valida dados, regras, SQL e desenho."],
                ["F", "6. Construção", "sfmc_create_journey_draft em dry-run; depois escrita aprovada."],
              ].map(([icon, title, description]) => (
                <div className="capability" key={title}>
                  <span className="capability-icon">{icon}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>

      <footer className="footer">
        Bluewolf MarTech Journey Factory • POC IBM Consulting Advantage + Salesforce Marketing Cloud •
        Nenhuma publicação automática é realizada por esta interface.
      </footer>
    </div>
  );
}
