# Burger Rush

Jogo casual de lanchonete em 3D (Three.js), feito para jogar um pouco todo dia no celular ou no navegador.

## Como jogar

Arraste na tela (ou use WASD / setas) para mover o chef:

1. Pegue os lanches na chapa, na fritadeira e na máquina de refri.
2. Entregue no balcão; cada produto tem sua seção.
3. Recolha o dinheiro e pise nas áreas tracejadas para comprar mesas, máquinas e ajudantes.

## Conteúdo

- **6 negócios no mapa da cidade**, cada um com 3 produtos e tema próprio:

  | Negócio | Produtos |
  |---|---|
  | Lanchonete da Praça | hambúrguer, batata, refri |
  | Quiosque da Praia | açaí, coco, sorvete |
  | Pizzaria do Shopping | pizza, suco, refri |
  | Pastelaria da Feira | pastel, caldo de cana, cachorro-quente |
  | Sorveteria do Parque | sundae, milkshake, rosquinha |
  | Café do Centro | café, bolo, suco |

- **Mais estabelecimentos ao mesmo tempo:** cada um tem 16 áreas para comprar, entre mesas, estações, ajudantes e faxineiro. Os que você não está jogando rendem dinheiro sozinhos.
- **Dificuldade:**
  - Os clientes têm paciência e vão embora bravos se demorar.
  - As mesas ficam sujas e precisam ser limpas.
  - A reputação ⭐ (1 a 5) muda o movimento e o quanto os clientes pagam.
- **Dopamina rápida:**
  - Combo de atendimentos seguidos, até x2.
  - Hora do rush: clientes chegam rápido e pagam em dobro.
  - Clientes VIP 👑 pagam 5x.
  - Presentes surpresa aparecem no salão.
- **Franquias:** até 10 unidades por estabelecimento completo, que rendem mesmo com o app fechado.
- **Nova cidade:** com 3 estabelecimentos completos, você recomeça do zero com bônus permanente em tudo.
- **Missões diárias:** 3 por dia, renovadas à meia-noite.
- **Bônus de dias seguidos:** até 7 dias.
- **Ganhos offline:** até 2 horas.
- **Progresso salvo** no aparelho, com versão de formato e migração automática (atualizações não quebram o save).
- **Save na nuvem** pelo Google Play Games (app Android): ao trocar de celular, o progresso volta sozinho.
- **Anúncios premiados opcionais:** dinheiro, turbo 2x, hora do rush e fama máxima; banner no app Android.
- **Privacidade para produção:** consentimento UMP do Google é solicitado antes dos anúncios quando exigido pela região.

## Estrutura

| Caminho | O que é |
|---|---|
| `www/index.html` | O jogo inteiro (HTML + JS) |
| `www/vendor/` | Three.js, fonte e Capacitor copiados do `node_modules` (`npm run vendor`), para o app abrir sem internet |
| `android/` | Projeto Android gerado pelo Capacitor |
| `android/app/src/main/java/.../PlayGamesSavesPlugin.java` | Plugin nativo do save na nuvem (Play Games Saved Games) |
| `store-listing/` | Textos, ícone, gráfico promocional, screenshots reais e rascunho de Segurança de dados |
| `www/privacy.html` | Política de privacidade pública |
| `www/app-ads.txt` | Declaração do editor AdMob preparada para hospedagem |

## Rodar localmente

```bash
npm install
npm run serve
```

Abra http://localhost:8766. Use `?auto=1` para um robô jogar sozinho (modo de teste, não salva) e `?fresh=1` para começar sem save.

## Gerar o app Android

Precisa de JDK 17 e Android SDK 36 (`ANDROID_HOME`).

```bash
npm run apk      # APK de teste: android/app/build/outputs/apk/debug/app-debug.apk
npm run bundle   # .aab para a Google Play (exige a chave de assinatura, ver abaixo)
```

## Evoluir o save sem perder progresso

O save tem um campo `v`. Ao mudar o formato:

1. Suba `SAVE_VERSION` em `www/index.html`.
2. Acrescente um passo em `MIGRATIONS` que converte da versão anterior.
3. Nunca apague passos antigos.

Se a nuvem tiver um save de versão mais nova que o app, o jogo não sobrescreve e pede para atualizar.

## Publicar na Google Play (passo a passo)

1. Crie a conta de desenvolvedor em https://play.google.com/console (US$ 25, uma vez).
2. **Criar app**: nome "Burger Rush", tipo Jogo, gratuito.
3. **Chave de assinatura** (guarde fora do repositório):
   `keytool -genkey -v -keystore burger-rush.jks -alias burger -keyalg RSA -keysize 2048 -validity 10000`
   Crie `android/keystore.properties` (já ignorado pelo git) com `storeFile`, `storePassword`, `keyAlias` e `keyPassword`; o `build.gradle` usa automaticamente.
4. **Play Games Services** > Configurar: crie o projeto e ative **Jogos salvos** (Saved Games).
5. Copie o **ID do projeto** (só números) para `android/app/src/main/res/values/strings.xml` em `game_services_project_id`.
6. Em Play Games Services > Credenciais, adicione uma credencial Android com o pacote `io.github.eliseurizzonato.burgerrush` e o SHA-1 da chave de assinatura do app (Play Console > Integridade do app). Para testar o APK de debug, crie outra credencial com o SHA-1 da chave de debug.
7. Adicione seu e-mail em **Testadores** do Play Games Services, senão o login não funciona antes de publicar.
8. Gere o `.aab` (`npm run bundle`), envie para **Teste fechado**, preencha a política de privacidade, a classificação de conteúdo e a ficha da loja.
9. Contas pessoais novas precisam de 12 testadores por 14 dias no teste fechado antes da produção.

## Pacote de produção 1.1

- `versionCode 6`, `versionName 1.1`, `minSdk 24`, `targetSdk 36`.
- AAB assinado: `../apk/burger-rush-1.1-v6.aab` (artefato local, não versionado).
- Ícone e splash usam a identidade oficial Burger Rush.
- Ficha pt-BR e notas da versão: `store-listing/pt-BR.md`.
- Rascunho de Segurança de dados: `store-listing/data-safety-draft.md` — revisar antes de enviar.
- Política: `https://eliseurizzonato.github.io/burger-rush/www/privacy.html` após o push do commit.
- O `app-ads.txt` está preparado, mas a verificação do AdMob exige que o arquivo esteja na raiz do domínio de desenvolvedor informado na Play Store.

## Prints

![Lanchonete completa](prints/v3-01-lanchonete-completa.jpg)
![Missões](prints/v3-02-missoes.jpg)
![Quiosque da Praia](prints/v3-05-quiosque-praia.jpg)
![Escolha de progresso na nuvem](prints/v4-01-conflito-nuvem.jpg)
