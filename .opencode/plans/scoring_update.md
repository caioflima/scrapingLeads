# Plano de Atualização - Matriz de Scoring de Prospecção

## Objetivo
Ajustar a lógica de pontuação (Score) e de classificação (Quente, Morno, Frio) no frontend para priorizar leads sem site próprio mas com presença em redes sociais, conforme a estratégia de negócios.

## Nova Estrutura de Scoring

*   **🔥 Quente (70+ pontos):** Foco em empresas com Instagram/Facebook ativos, WhatsApp, sem site.
*   **🟡 Morno (45–69 pontos):** Foco em empresas que já possuem site e/ou redes sociais. A venda é consultiva (SEO, melhorias, automação).
*   **🧊 Frio (0–44 pontos):** Empresas sem redes, sem site e pouca informação. Presença digital praticamente inexistente.

## Passos da Implementação (Modo Somente Leitura)

### 1. Atualizar o Texto Descritivo no Topo da Página
No arquivo `src/public/prospeccao.html`, o texto da seção `.pros-intro` será substituído para refletir a nova matriz, descrevendo exatamente as faixas de pontos (70+, 45-69, 0-44) e o foco estratégico de abordagem.

### 2. Ajustar o Cálculo de `prosScore`
A lógica de pontuação, que aparece em dois lugares (`fetchLeads` e `enrichLeadOnTheFly`), será modificada. A nova pontuação base será estruturada da seguinte forma:

```javascript
let prosScore = 0;

// Dados Básicos:
if (l.whatsapp || l.phone) prosScore += 15; // Presença de contato via WhatsApp/Telefone
if (l.email) prosScore += 5;
if (l.endereco && l.endereco !== "Endereço não informado") prosScore += 10; // Indicador forte de GMN / Google Maps
if (l.enriched_at) prosScore += 5; // Indicador de contato enriquecido e pesquisado na web

// Oportunidades:
if (!hasWebsite && hasSocial) {
  prosScore += 50; // 🔥 Dá o pulo para Quente (facilmente passará de 70 com os bônus básicos acima)
} else if (hasWebsite) {
  prosScore += 30; // 🟡 Mantém no nível Morno (ficará entre 45 e 69 na maioria dos casos)
} else {
  // Sem site e sem redes: Fica estagnado na faixa fria (só pontua o básico, raramente passando de 44)
  prosScore += 5;
}
```

### 3. Ajustar os Tiers (Limiares de Corte)
Logo após o cálculo da pontuação, o corte de temperaturas passará a ser:

```javascript
if (prosScore >= 70) l.tier = "quente";
else if (prosScore >= 45) l.tier = "morno";
else l.tier = "frio";
```

## Conclusão do Planejamento
Este plano reflete as alterações pedidas, focando perfeitamente a prospecção da LimaEnterprise nas empresas engajadas digitalmente mas que ainda precisam desenvolver seus sites, otimizando seu fluxo de vendas. Quando permitido sair do Modo de Planejamento, estas lógicas de Javascript serão aplicadas ao `prospeccao.html`.
