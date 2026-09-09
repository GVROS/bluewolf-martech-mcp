export type JourneyBriefing = {
  name: string;
  objective: string;
  audience: string;
  offer: string;
  channels: string[];
  entryCriteria?: string;
  exitCriteria?: string;
  businessRules?: string;
  dataNeeds?: string[];
  kpis?: string[];
  requester?: string;
  technicalOwner?: string;
  approver?: string;
  notes?: string;
};

export type ValidationItem = {
  id: string;
  label: string;
  status: "ready" | "warning" | "blocked";
  detail: string;
};

export type JourneyBlueprint = {
  blueprintId: string;
  version: number;
  status: "STRATEGY_DRAFT";
  generatedAt: string;
  briefing: JourneyBriefing;
  strategy: {
    hypothesis: string;
    valueProposition: string;
    entryMoment: string;
    contactPolicy: string[];
    decisioning: string[];
    exitConditions: string[];
  };
  journeyDesign: {
    name: string;
    keySuggestion: string;
    entrySource: string;
    steps: Array<{
      order: number;
      type: "ENTRY" | "WAIT" | "DECISION" | "MESSAGE" | "UPDATE" | "EXIT";
      name: string;
      description: string;
      channel?: string;
    }>;
  };
  dataPlan: {
    requiredAttributes: string[];
    candidateSources: string[];
    segmentationQuestions: string[];
    dataCloudRole: string[];
  };
  automationPlan: {
    preProcessing: string[];
    queries: Array<{
      name: string;
      purpose: string;
      sqlDraft: string;
    }>;
    monitoring: string[];
  };
  governance: {
    stages: Array<{
      order: number;
      stage: string;
      owner: string;
      gate: string;
    }>;
    requiredApprovals: string[];
    writePolicy: string;
  };
  validation: ValidationItem[];
  nextActions: string[];
};

function clean(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

function keySuggestion(name: string) {
  const base = slugify(name).replace(/-/g, "_").toUpperCase() || "JOURNEY";
  return `ICA_${base}`.slice(0, 60);
}

export function validateBriefing(briefing: JourneyBriefing): ValidationItem[] {
  const items: ValidationItem[] = [
    {
      id: "objective",
      label: "Objetivo de negócio definido",
      status: briefing.objective?.trim() ? "ready" : "blocked",
      detail: briefing.objective?.trim() || "Informe o resultado de negócio esperado.",
    },
    {
      id: "audience",
      label: "Público e elegibilidade definidos",
      status: briefing.audience?.trim() ? "ready" : "blocked",
      detail: briefing.audience?.trim() || "Informe quem pode entrar na jornada.",
    },
    {
      id: "offer",
      label: "Oferta ou proposta de valor definida",
      status: briefing.offer?.trim() ? "ready" : "blocked",
      detail: briefing.offer?.trim() || "Informe a oferta, serviço ou ação esperada.",
    },
    {
      id: "channels",
      label: "Canais definidos",
      status: briefing.channels?.length ? "ready" : "blocked",
      detail: briefing.channels?.length
        ? unique(briefing.channels).join(", ")
        : "Selecione ao menos um canal.",
    },
    {
      id: "entry",
      label: "Critério de entrada",
      status: briefing.entryCriteria?.trim() ? "ready" : "warning",
      detail:
        briefing.entryCriteria?.trim() ||
        "A IA pode sugerir o critério, mas o consultor deve validar a origem do dado.",
    },
    {
      id: "data",
      label: "Necessidades de dados",
      status: briefing.dataNeeds?.length ? "ready" : "warning",
      detail: briefing.dataNeeds?.length
        ? unique(briefing.dataNeeds).join(", ")
        : "Mapear atributos, Data Extensions, Data Cloud e regras de identidade antes da publicação.",
    },
    {
      id: "approval",
      label: "Aprovador identificado",
      status: briefing.approver?.trim() ? "ready" : "warning",
      detail:
        briefing.approver?.trim() ||
        "Definir aprovador de Marketing/Negócio antes de qualquer escrita no Marketing Cloud.",
    },
  ];

  return items;
}

export function buildJourneyBlueprint(input: JourneyBriefing): JourneyBlueprint {
  const channels = unique(input.channels?.length ? input.channels : ["Email"]);
  const dataNeeds = unique(
    input.dataNeeds?.length
      ? input.dataNeeds
      : [
          "ContactKey/SubscriberKey",
          "consentimento por canal",
          "produto/serviço atual",
          "elegibilidade da oferta",
          "histórico de contato",
        ],
  );
  const kpis = unique(
    input.kpis?.length
      ? input.kpis
      : ["conversão", "taxa de resposta", "opt-out", "incrementalidade"],
  );

  const briefing: JourneyBriefing = {
    ...input,
    name: clean(input.name, "Nova Jornada MarTech"),
    objective: clean(input.objective, "Objetivo a validar com Marketing"),
    audience: clean(input.audience, "Público a validar"),
    offer: clean(input.offer, "Oferta a validar"),
    channels,
    dataNeeds,
    kpis,
  };

  const steps: JourneyBlueprint["journeyDesign"]["steps"] = [
    {
      order: 1,
      type: "ENTRY",
      name: "Entrada elegível",
      description: clean(
        briefing.entryCriteria,
        `Selecionar ${briefing.audience} após validação dos dados e consentimentos.`,
      ),
    },
    {
      order: 2,
      type: "DECISION",
      name: "Validação de elegibilidade e pressão",
      description:
        "Excluir clientes sem consentimento, fora da oferta, já convertidos ou acima da política de contato.",
    },
  ];

  channels.forEach((channel, index) => {
    steps.push({
      order: steps.length + 1,
      type: "MESSAGE",
      name: `${channel} — mensagem ${index + 1}`,
      description: `Comunicar ${briefing.offer} com conteúdo e CTA aprovados para ${briefing.audience}.`,
      channel,
    });
    if (index < channels.length - 1) {
      steps.push({
        order: steps.length + 1,
        type: "WAIT",
        name: "Janela de resposta",
        description:
          "Aguardar janela definida pela estratégia e verificar conversão antes do próximo contato.",
      });
      steps.push({
        order: steps.length + 1,
        type: "DECISION",
        name: "Converteu?",
        description:
          "Se converteu, encerrar; caso contrário, seguir para o próximo canal elegível.",
      });
    }
  });

  steps.push({
    order: steps.length + 1,
    type: "UPDATE",
    name: "Registrar resultado",
    description:
      "Persistir status, última interação, motivo de saída e resultado para reporting e contexto futuro.",
  });
  steps.push({
    order: steps.length + 1,
    type: "EXIT",
    name: "Saída controlada",
    description: clean(
      briefing.exitCriteria,
      "Converter, perder elegibilidade, revogar consentimento ou atingir limite da régua.",
    ),
  });

  const validation = validateBriefing(briefing);
  const blockers = validation.filter((item) => item.status === "blocked").length;

  return {
    blueprintId: `bp-${Date.now()}-${slugify(briefing.name).slice(0, 18) || "journey"}`,
    version: 1,
    status: "STRATEGY_DRAFT",
    generatedAt: new Date().toISOString(),
    briefing,
    strategy: {
      hypothesis: `Se comunicarmos ${briefing.offer} para ${briefing.audience} no momento correto, esperamos contribuir para ${briefing.objective}.`,
      valueProposition: briefing.offer,
      entryMoment: clean(
        briefing.entryCriteria,
        "Entrada após elegibilidade, consentimento, disponibilidade da oferta e política de contato.",
      ),
      contactPolicy: [
        "Priorizar consentimento e preferência de canal.",
        "Aplicar supressão de clientes já convertidos antes de cada contato.",
        "Definir frequência máxima e janela entre mensagens antes da ativação.",
        "Registrar todas as saídas para evitar reentrada indevida.",
      ],
      decisioning: [
        "Elegibilidade comercial",
        "Consentimento por canal",
        "Conversão após cada contato",
        "Disponibilidade de próximo melhor canal",
        "Regras de exclusão e pressão de comunicação",
      ],
      exitConditions: [
        clean(briefing.exitCriteria, "Conversão ou perda de elegibilidade"),
        "Revogação de consentimento",
        "Fim da validade da oferta",
        "Limite de contatos atingido",
      ],
    },
    journeyDesign: {
      name: briefing.name,
      keySuggestion: keySuggestion(briefing.name),
      entrySource:
        "Segmento/Data Extension validado; quando aplicável, ativação originada no Salesforce Data Cloud.",
      steps,
    },
    dataPlan: {
      requiredAttributes: dataNeeds,
      candidateSources: [
        "Salesforce Marketing Cloud — Data Extensions",
        "Salesforce Data Cloud — DLO/DMO/segmentos/ativação",
        "CRM/Service/Commerce conforme o caso de uso",
        "Consentimento e preferências de canal",
        "Histórico de jornadas e respostas",
      ],
      segmentationQuestions: [
        "Qual é a entidade de ativação: indivíduo, conta, contrato, produto ou fornecimento?",
        "Qual chave identifica o cliente no Marketing Cloud?",
        "Qual é a fonte oficial de elegibilidade e consentimento?",
        "Existe risco de duplicidade por e-mail, telefone, contrato ou unidade de negócio?",
        "Qual a latência máxima permitida entre mudança no dado e entrada na jornada?",
      ],
      dataCloudRole: [
        "Unificar e enriquecer atributos quando a origem estiver no Data Cloud.",
        "Construir/validar segmentos e critérios de ativação.",
        "Entregar somente os atributos necessários para a execução da jornada.",
        "Preservar a granularidade correta do caso de uso e evitar unificação indevida.",
      ],
    },
    automationPlan: {
      preProcessing: [
        "Validar disponibilidade das fontes e chaves.",
        "Materializar audiência elegível em DE/segmento de ativação quando necessário.",
        "Aplicar exclusões, consentimento e deduplicação.",
        "Criar tabela de controle para idempotência, reentrada e histórico.",
      ],
      queries: [
        {
          name: "QRY_01_AUDIENCIA_ELEGIVEL",
          purpose:
            "Selecionar audiência elegível com as chaves e atributos mínimos para a jornada.",
          sqlDraft:
            "SELECT /* campos validados */\nFROM /* fonte oficial */\nWHERE /* elegibilidade + consentimento + regras de negócio */",
        },
        {
          name: "QRY_02_SUPRESSAO_CONVERSAO",
          purpose:
            "Excluir convertidos, inelegíveis, opt-outs e contatos acima da política de pressão.",
          sqlDraft:
            "SELECT /* audiência ainda elegível */\nFROM /* target */\nWHERE NOT EXISTS (/* conversão / opt-out / bloqueio */)",
        },
        {
          name: "QRY_03_HISTORICO_RESULTADO",
          purpose:
            "Persistir resultado da execução para reporting, auditoria e contexto de próximas jornadas.",
          sqlDraft:
            "SELECT /* id da jornada, contato, etapa, resultado, timestamp */\nFROM /* fontes de tracking */",
        },
      ],
      monitoring: [
        "Volume de entrada versus audiência esperada",
        "Falhas de Automation Studio e queries",
        "Erros de atividade/canal",
        "Conversão e saídas por motivo",
        "Opt-out e pressão de comunicação",
        "Divergência entre segmento aprovado e audiência executada",
      ],
    },
    governance: {
      stages: [
        { order: 1, stage: "Demanda", owner: "Marketing/Cliente", gate: "Caso de uso priorizado" },
        { order: 2, stage: "Briefing", owner: "Marketing/Cliente + ICA", gate: "Briefing mínimo completo" },
        { order: 3, stage: "Discovery e contexto", owner: "ICA + Consultoria", gate: "Histórico e referências analisados" },
        { order: 4, stage: "Validação de dados", owner: "Consultor/CRM/Data", gate: "Fontes, chaves, consentimento e granularidade aprovados" },
        { order: 5, stage: "Estratégia IA", owner: "ICA", gate: "Blueprint gerado e rastreável" },
        { order: 6, stage: "Validação técnica", owner: "IBM/MarTech", gate: "DEs, SQL, atividades, limites e dependências aprovados" },
        { order: 7, stage: "Aprovação de negócio", owner: "Marketing/Cliente", gate: "Conteúdo, oferta, público e KPIs aprovados" },
        { order: 8, stage: "Draft no SFMC", owner: "MCP Gateway", gate: "Somente após aprovação explícita" },
        { order: 9, stage: "Ajustes e QA", owner: "IBM + Cliente", gate: "Testes funcionais, dados e canais aprovados" },
        { order: 10, stage: "Publicação e monitoramento", owner: "Operação MarTech", gate: "Go-live autorizado e plano de rollback definido" },
        { order: 11, stage: "Aprendizado", owner: "ICA + MarTech", gate: "Resultados e artefatos incorporados ao contexto" },
      ],
      requiredApprovals: [
        "Validação técnica IBM/MarTech",
        "Aprovação do responsável de Marketing/Negócio",
        "QA de dados e canais",
        "Autorização explícita antes de escrita/publicação no SFMC",
      ],
      writePolicy:
        "Nenhuma ferramenta de escrita deve publicar ou ativar jornada automaticamente. O gateway pode criar somente draft quando approved=true e dryRun=false; publicação permanece uma etapa separada de governança.",
    },
    validation,
    nextActions: [
      blockers
        ? `Resolver ${blockers} item(ns) bloqueador(es) do briefing antes de avançar.`
        : "Executar snapshot de contexto no Marketing Cloud e comparar jornadas existentes.",
      "Validar Data Extensions, campos, consentimento, chaves e granularidade com o consultor técnico.",
      "Revisar a estratégia sugerida pela IA com Marketing e registrar ajustes.",
      "Gerar draft técnico de DEs, SQL, automações e Journey Builder.",
      "Após aprovação explícita, criar apenas o draft da jornada no Marketing Cloud e executar QA antes de publicar.",
      `Definir medição dos KPIs: ${kpis.join(", ")}.`,
    ],
  };
}

export function getMartechCapabilities() {
  return {
    product: "Bluewolf MarTech Journey Factory",
    operatingModel: "IBM Consulting Advantage + MCP Gateway + Salesforce Marketing Cloud",
    scope: [
      "entrada e qualificação de demanda",
      "briefing assistido",
      "discovery e reutilização de contexto histórico",
      "validação de dados e segmentação",
      "estratégia de jornada gerada/assistida por IA",
      "desenho de jornada",
      "plano técnico de Data Extensions, SQL e automações",
      "validação técnica e aprovação de negócio",
      "criação controlada de draft no Journey Builder",
      "QA, publicação e monitoramento",
      "captura de aprendizado para próximas demandas",
    ],
    guardrails: [
      "credenciais nunca são retornadas por ferramentas",
      "escrita no SFMC é bloqueada por padrão",
      "draft exige approved=true e dryRun=false",
      "publicação/ativação não é automática neste estágio da POC",
      "decisões de dados e identidade precisam de validação humana",
    ],
  };
}
