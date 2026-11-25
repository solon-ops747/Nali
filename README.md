# SAO — um cantinho de arte

Site privado, responsivo e em português para compartilhar álbuns com pessoas escolhidas e conversar em mensagens privadas. Não existe cadastro público: a artista cria cada acesso e escolhe os álbuns permitidos.

## Privacidade e limites

- O site não mantém histórico de quem abriu ou visualizou cada álbum.
- As imagens ficam em armazenamento privado. O site só gera um link temporário para alguém que já tem permissão para aquele álbum.
- A artista também pode vincular links externos (por exemplo, álbuns/vídeos no YouTube, Google Fotos/Drive, Vimeo). Ao abrir um link, a pessoa passa a usar o serviço daquele link, que pode ter seus próprios registros e regras.
- As conversas são privadas entre a artista e cada pessoa; outros usuários não conseguem ler essas mensagens.
- A artista verá o nome de acesso de quem mandar mensagem. Não há como impedir que alguém copie uma imagem ou faça uma captura de tela.
- O site não grava eventos de visualização, mas o provedor de hospedagem/infraestrutura pode manter registros técnicos e de segurança. Não prometa anonimato absoluto.
- Nomes de acesso não são endereços de e-mail. A senha é gerenciada pelo Supabase Auth; não é salva em texto pelo site.

## Publicar gratuitamente

O site usa GitHub Pages para os arquivos da página e Supabase para login, banco de dados, mensagens e imagens privadas. Os planos gratuitos têm limites e regras que podem mudar; confira os limites atuais antes de publicar. Projetos gratuitos do Supabase podem ser pausados após períodos de inatividade.

### 1. Criar o projeto Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto no plano gratuito. Guarde a senha do banco em local seguro.
2. No painel do projeto, abra **SQL Editor**, crie uma consulta e execute todo o conteúdo de `supabase/schema.sql`.
3. Crie a conta da artista em **Authentication → Users → Add user**. Use:
   - Email: `artista@login.sao.app`
   - Senha: uma senha forte que só a artista conheça
   - Marque a confirmação do email, se essa opção aparecer.
4. Copie o UUID desse usuário na lista de usuários. No SQL Editor, execute o comando abaixo, trocando o UUID pelo valor copiado:

   ```sql
   insert into public.profiles (user_id, username)
   values ('UUID-DA-ARTISTA', 'artista')
   on conflict (user_id) do update set username = excluded.username;
   insert into public.sellers (user_id)
   values ('UUID-DA-ARTISTA');
   ```

5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon/public**. Cole-as em `config.js` nos campos `supabaseUrl` e `supabaseAnonKey`. A chave `service_role` nunca deve ir para `config.js`, para o GitHub ou para o navegador.

### 2. Ativar criação segura de acessos

A artista cria contas pelo painel do site. Essa ação precisa passar por uma função protegida do Supabase:

1. Instale o [Supabase CLI](https://supabase.com/docs/guides/cli) e autentique-o (`supabase login`).
2. Na pasta do projeto, vincule o projeto: `supabase link --project-ref SEU_PROJECT_REF`. O project ref aparece na URL e nas configurações do projeto.
3. Na pasta do projeto, publique a função:

   ```powershell
   supabase functions deploy create-user
   ```

   O Supabase fornece as variáveis de ambiente necessárias à função hospedada. Nunca coloque a chave `service_role` no site, no GitHub ou em `config.js`.
4. Se a função exigir verificação JWT no deploy, mantenha essa verificação ativada. A função também valida o usuário e confere a tabela privada `sellers` antes de criar uma conta.

### 3. Publicar o site no GitHub Pages

1. Crie um repositório no GitHub e envie os arquivos deste projeto. `config.js` contém apenas a URL do projeto e a chave pública `anon`; mesmo assim, não envie senhas nem chaves `service_role`.
2. No repositório, abra **Settings → Pages**. Em **Build and deployment**, selecione **Deploy from a branch**, escolha a branch `main` e a pasta `/ (root)`, depois salve.
3. Aguarde o endereço indicado pelo GitHub Pages. Abra-o e entre com o nome `artista` e a senha criada no Supabase.

### 4. Usar

1. No **Painel da artista**, crie os álbuns.
2. Crie um nome de acesso e uma senha para cada pessoa. Compartilhe a senha em particular.
3. Marque os álbuns liberados para cada pessoa e clique em **Salvar**.
4. Adicione conteúdo aos álbuns (só a artista vê as opções de adicionar):
   - **Imagens:** pelo Painel da artista em **Adicionar imagens** ou pelo botão **＋ Adicionar → Imagens** no álbum (até 8 MB cada; JPEG, PNG, WebP, GIF ou AVIF).
   - **Links de álbuns/vídeos:** pelo Painel da artista em **Vincular link de álbum/vídeo** ou pelo botão **＋ Adicionar → Link de álbum/vídeo** no álbum. Cole um link compartilhável (ex.: YouTube, Google Fotos/Drive, Vimeo). É a forma recomendada para vídeos, sem precisar enviar arquivos grandes.
5. As pessoas entram com o nome de acesso e a senha e podem ver apenas os álbuns autorizados e conversar individualmente com a artista.

## Desenvolvimento local

Sirva esta pasta com qualquer servidor HTTP estático e configure `config.js` com os dados do Supabase. Abrir `index.html` diretamente pode impedir algumas funções do navegador e não é recomendado.
