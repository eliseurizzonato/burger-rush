# Burger Rush 1.5 — candidato web

Base: `a4e22c3`. Save v8; Android existente 9 (1.4). O candidato está em desenvolvimento/validação local, sem publicação nesta tarefa. A identificação web fica em `www/build-info.json`.

## Escopo implementado

| Pedido | Entrega |
| --- | --- |
| 1–3. Funcionários, skills, especializações e sinergias | Progressão existente preservada; história, talento, preferências, objetivos, uniformes pessoais, transferência entre postos equivalentes, títulos por profissão, prévia dos bônus e rejeição de trocas sem efeito. |
| 4. Offline | Turno inicial de 8 h e melhorias existentes; XP reduzido; produção/automação com capacidade e custos; janela de ausência consumida uma vez, sem duplicar o faturamento da loja atual. |
| 5. Recompensas de anúncio | Callback earned do SDK, deduplicação e limites locais; treino, pesquisa, delivery, produção e giro extra opcionais. Progressão gratuita permanece. SDK real e validação em servidor não foram certificados aqui. |
| 6. Bolsa | Posições/investimento por ativo, custo médio, cotação e resultado preservados; histórico de 100 operações, consolidado de dividendos/resultado, operações de 5k e validação de quantidades/saldos. Formulário de ordem preserva a entrada enquanto o mercado atualiza. |
| 7. Farming | Alface, tomate, trigo, leite, queijo, molho e tempero raro; cultivos/fábricas, colheita manual, automação, uso no laboratório, receitas e contratos. |
| 8. Laboratório | Livro permanente, pesquisa com ingredientes/moedas, receita ativa com consumo real por pedido e bônus; receitas de temporada também liberam pratos pesquisáveis no laboratório. |
| 9. Equipamentos | Mantidos limites por fase, estimativa de retorno, gargalos, preparo paralelo, esteira e maestria existentes. |
| 10. Procedural | Semente persistente por loja/cidade, permutações seguras de mesas/compra, decoração periférica e variações de pedidos, recursos e chegada. Geometria/BFS validados, com fallback seguro. Não gera arquitetura irrestrita. |
| 11. Personalidade | Fichas, história, talento, preferência, objetivo pessoal, histórico e uniformes. |
| 12. Clientes | Recorrentes com fidelidade/gorjeta, críticos e avaliações por loja, além dos VIPs existentes. |
| 13–15. Delivery, contratos e eventos | Estoque compartilhado, custos, prazos, entregador com capacidade/velocidade, pagamento único, fornecimento parcial, penalidade proporcional limitada e eventos com efeitos reais. |
| 16–19. Desafios, baús, temporada e coleções | Desafios rápidos, baú diário e semanal por participação, giro gratuito, chances exibidas, alternativa garantida ao item raro, temporada de 14 dias e recompensas permanentes. Não há compra de tentativas com dinheiro real. |
| 20–21. Rede e prestígio | Franquias/cidades existentes, indicadores por unidade, transferência de funcionários; prévia explícita do reset, livro, coleções, cosméticos e guarda-roupa preservados. |
| 22. Personalização | Oito superfícies/itens por loja: piso, parede, balcão, fachada, equipamentos, mesas, flores e uniforme. Compra compartilhada, equipamento por unidade e mudança real dos materiais 3D. |
| 23. Conta e sincronização | Visitante/local mantidos; envelope completo dos novos sistemas, conflito por revisão e proteção contra save futuro. Web usa transação. Regras mais restritas estão preparadas em `firestore.rules`, sem implantação nesta tarefa. |
| 24–25. Mobile, feedback e acessibilidade | Navegador mobile primeiro, ações de toque, painéis responsivos, abas, fechamento acessível, rolagem preservada e sons de compras/recompensas. Preferências de som, animação reduzida e modo econômico preservadas. |
| 26. Métricas | Fluxos de moedas, participação, resgates, atividades e resumo de sessão/7 dias no próprio save. Não é analytics agregado de usuários nem medição real de retenção D1/D7. |
| 27. Técnica/publicação | Migração aditiva, testes de economia/relógio/recompensas e milhares de sementes. Navegador com fixture isolada; aparelhos físicos, Google/AdMob reais e nova versão Android ainda exigem validação. |

## Feedback adicional das cinco fotos

1. Reorganizar mesas, máquinas e a coleta de dinheiro com validação geométrica, sem alterar câmera ou controles.
2. Não pegar produtos automaticamente dentro da área de coleta de moedas.
3. Manter preço, operação e quantidade da ordem até o usuário escolher outra empresa ou pedir a cotação atual.
4. Operadores de produção contratados com moedas do jogo e especialista com rendimento adicional de 25%; sem integração de pagamento real.
5. Separar profissão, graduação, habilidade e especialização. Não cobrar por bônus inaplicável; não reembolsar valores históricos sem evidência do gasto incorreto.

## Verificação

Os resultados finais e capturas ficam em `evidencias/v10-*`. `tests/browser.html` usa um save v7 sintético, migra para v8, desabilita apenas a inicialização da conta e informa DPR ao renderizador dentro do iframe. O DPR físico do navegador também é registrado; isso não equivale a teste em aparelho físico.

Rodar `npm test` para regras. A suíte procedural verifica 200.000 layouts e alcance por BFS, incluindo milhares de sementes. O harness integrado cobre caixa, migração, posições, movimento/entrada, ordens, offline, receitas, materiais e transferência.

Preparar a prévia copiando **somente `www/` e `tests/browser.html`** para uma pasta temporária, sem links simbólicos, Android ou arquivos de assinatura. Servir essa cópia em loopback. O teste recusa domínio público; nunca usar conta real como fixture.

## Limites antes de produção

- Login/sincronização em dois dispositivos reais, SDK AdMob, consentimento e recompensas nativas não foram retestados nesta tarefa.
- Relógio monotônico e claims locais reduzem repetição, mas cliente/save editável não é uma autoridade antifraude. Recompensas com garantia de servidor precisam de SSV/backend.
- As regras Firebase novas precisam de teste em emulador/homologação e implantação aprovada. A transação web segue o [contrato oficial do Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions); validações de campos seguem as [regras oficiais](https://firebase.google.com/docs/firestore/security/rules-fields).
- Liga semanal existente é simulada; não foi criada uma competição online.
- Balanceamento de longo prazo, retenção e desempenho em aparelhos físicos ainda precisam de dados reais. Testes de regras não comprovam dias de diversão ou receita publicitária.
- Publicar primeiro o site após aprovação, verificar o commit servido e só então gerar/enviar o próximo AAB. Publicação web, regras Firebase e Play Console são aprovações distintas.
