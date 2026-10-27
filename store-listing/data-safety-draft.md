# Rascunho — Segurança de dados da Google Play

Este arquivo é um roteiro de preenchimento. As respostas devem ser conferidas e aprovadas antes do envio na Play Console.

## Visão geral sugerida

- O app coleta ou compartilha dados obrigatórios: **Sim**.
- Todos os dados são criptografados em trânsito: **Sim** (serviços Google usam HTTPS/TLS).
- Usuários podem solicitar exclusão: **Sim**, pelo e-mail zalency.tech@gmail.com e pelas configurações da conta Google.
- Conta criada dentro do app: **Não**. O login opcional usa uma conta Google já existente via Play Games Services.

## Dados prováveis por SDK

### Identificadores do dispositivo ou outros identificadores

- Coletado: Sim.
- Compartilhado: Sim, com Google AdMob.
- Finalidade: publicidade/marketing, análise, prevenção de fraude, segurança e conformidade.
- Obrigatório: o banner pode usar identificadores; vídeos premiados são opcionais.

### Atividade no app — interações com o app e anúncios

- Coletado: Sim.
- Compartilhado: Sim, com Google AdMob.
- Finalidade: publicidade/marketing, análise e prevenção de fraude.

### Informações e desempenho do app — registros de falhas e diagnósticos

- Coletado: pode ocorrer por SDKs Google.
- Compartilhado: Sim, com os provedores Google aplicáveis.
- Finalidade: análise, funcionalidade, segurança e correção de falhas.

### Informações pessoais — nome/identidade do jogador

- O jogo pode receber o nome público da conta do Play Games para exibição do status de login.
- Não é vendido e é usado para funcionalidade da conta/salvamento.

### Faixa etária

- O usuário informa uma data de nascimento para definir o tratamento de anúncios.
- A data completa não é armazenada nem transmitida pelo jogo; somente a faixa local `child`, `teen` ou `adult` permanece no save.
- Menores de 13 anos não recebem anúncios; adolescentes são marcados para tratamento restrito no AdMob.

### Atividade no app — progresso de jogo

- Coletado: Sim, quando Jogos Salvos estiver ativado pelo jogador.
- Compartilhado: processado pelo Google Play Games Services.
- Finalidade: funcionalidade do app, sincronização e restauração do progresso.

## Pontos que exigem validação na Play Console

- Verificar a seção "Segurança de dados" gerada pelos SDKs declarados no AAB.
- Confirmar se a configuração do AdMob usa consentimento/UMP nas regiões aplicáveis.
- Confirmar a faixa etária e se o app será incluído no programa Famílias. Este rascunho pressupõe que **não** será direcionado a menores de 13 anos.
