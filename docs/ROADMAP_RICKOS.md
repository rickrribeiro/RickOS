# Padrão `ROADMAP_RICKOS.md`

O rickOS lê o arquivo `ROADMAP_RICKOS.md` na **raiz do repositório** de cada projeto (o
"caminho local" cadastrado no projeto) e mostra o roadmap na aba **🗺 Roadmap** da
página do projeto, em **árvore** ou **tabela**. Clicar no marcador de um item grava a
mudança de volta no arquivo.

Sem o arquivo, a aba oferece **"Criar a partir do modelo"**.

## Estrutura

```markdown
# Roadmap — Nome do projeto          ← título (ignorado)

## Área / épico                       ← nível 1 da árvore (coluna "Área" na tabela)

### Funcionalidade                    ← nível 2 (coluna "Funcionalidade")
- [ ] #1 Tarefa @v1.2 !alta           ← item com número, status, versão e prioridade
  - [x] #2 Subtarefa                  ← itens aninhados por indentação (2 espaços)
- Nota sem checkbox                   ← aparece na árvore, não conta no progresso
```

## Marcadores de status

| Marcador | Significado   |
|----------|---------------|
| `[ ]`    | A fazer       |
| `[~]`    | Em andamento  |
| `[x]`    | Feito         |
| `[-]`    | Descartado (não conta no progresso) |

Clicar no marcador na árvore avança `[ ] → [~] → [x] → [ ]`; na tabela há um seletor.

## Numeração

Todo item com checkbox leva `#N` logo após o marcador (`- [ ] #12 Tarefa`), para citar o
item numa conversa ("faz o #12"). O número é um **ID estável**, não a posição:

* item novo = **maior número do arquivo + 1**, em qualquer lugar do arquivo;
* nunca renumere nem reaproveite números (nem de itens apagados ou descartados);
* notas sem checkbox não são numeradas.

O número aparece na árvore e na coluna `#` da tabela. Se houver itens sem número, a aba
mostra o botão **"# Numerar N"**, que grava os números que faltam sem mexer nos existentes.

## Delegar itens ao Claude

**"☑ Selecionar p/ delegar"** liga a seleção (na árvore e na tabela). Marcar uma área ou
funcionalidade seleciona todos os itens abertos dela (a fazer ou em andamento). **"🤖 Delegar N"** abre o
modal de delegação já com os itens (`#N`, área, versão, prioridade) e as regras: fazer em paralelo
com subagentes, **um commit por item** (`Roadmap-Item: N` no corpo), não mexer no roadmap e não
fazer push. O Claude monta o prompt, que abre no Prompt Runner para você revisar, como na
delegação normal. Ao montar o prompt (ou "Executar direto"), os itens selecionados passam para
**em andamento** `[~]`; marcar como feito fica com você, depois de validar. Cancelar o modal não
muda nada.

## Metadados opcionais (no fim do item)

* `@v1.2` — versão/ciclo da entrega (filtro "versão" no topo).
* `!alta`, `!media`, `!baixa` — prioridade.

## Exemplo

```markdown
# Roadmap — RickOS

## Projetos

### Central de projetos
- [x] #1 Situação × estágio @v2 !alta
- [~] #2 Página do projeto @v2 !alta
  - [x] #3 Próxima ação e onde parei
  - [ ] #4 Roadmap em árvore
- [ ] #5 Revisão semanal com IA @v2.1

## Finanças
- [ ] #6 Importar OFX @v3
- [-] #7 Integração com banco X
```
