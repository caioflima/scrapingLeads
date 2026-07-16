# Plano de Atualização - Fluxo de Prospecção

## Objetivo
Atualizar o sistema de prospecção para que a página "Prospecção" deixe de usar dados estáticos, passando a consumir dados do backend. Além disso, classificar os leads de acordo com a probabilidade de conversão (ex: tem site ou não).

## Passos da Implementação

1. **Atualização no Backend (`src/repositories/leadRepository.js`)**:
   - Modificar a função `listLeads` para extrair e retornar os campos `website`, `address` e `segmento` diretamente do campo JSON `raw_data`. 
   - *Código planejado para `listLeads`:*
     Adicionar no `select`:
     ```javascript
     db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.website')) as website"),
     db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.address')) as address"),
     db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.segmento')) as segmento")
     ```

2. **Atualização no Frontend (`src/public/prospeccao.html`)**:
   - **Remover Dados Fixos**: Deletar a constante estática `const LEADS = [...]`.
   - **Novo Botão**: Inserir o botão "Atualizar Lista de Prospecção" (`#refreshProsBtn`) nos controles da página.
   - **Integração de Dados**: Criar a função `fetchLeads()` que fará uma requisição para `/api/leads?limit=100` (ou similar) para buscar os leads.
   - **Lógica de Análise**:
     - *Has website*: Verificar a presença da propriedade `website` vinda do backend.
     - *Temperatura*: Mapear `temperature` (`hot` -> quente, `warm` -> morno, `cold` -> frio).
     - *Oportunidade e Motivo*: 
       - Se não tem site: A abordagem será sugerir a criação de uma Landing Page / Site.
       - Se já tem site: A abordagem focará em automação, CRM, gestão de agendamentos, etc.
   - **Renderização Dinâmica**: Adaptar a função `renderLead(lead)` para utilizar os dados reais (nome, email, telefone, segmento, score, tier, endereço).
   - **Filtros e Controles**: Manter a lógica de filtros de abas ("Todos", "Quentes", "Mornos", "Só com contato"), agora operando sob o array dinâmico buscado da API.

3. **Demais Páginas**:
   - A separação nas páginas `leads.html`, `whatsapp.html` e `email.html` já está operante no fluxo atual. O plano mantém o funcionamento destas seções intacto, focando a alteração central na área de `Prospecção`.

## Conclusão
Este plano conclui a etapa de planejamento (Plan Mode). A implementação fará a conexão completa da análise de leads com os dados coletados nos scrapings (como Google Maps).