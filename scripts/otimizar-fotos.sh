#!/usr/bin/env bash
# =============================================================
# Otimiza as fotos do site: reduz o tamanho, corrige a rotação
# e remove metadados (EXIF), inclusive a localização GPS.
#
# Roda automaticamente no GitHub (workflow publicar.yml), mas
# também pode ser executado no seu computador:
#     bash scripts/otimizar-fotos.sh
# Requer ImageMagick 6 ou 7.
#
# É idempotente: uma foto já otimizada não é processada de novo,
# então rodar o script várias vezes não degrada a qualidade.
#
# Atenção ao editar: com "set -e", evite a forma "[ teste ] && comando".
# Quando o teste é falso, ela devolve código 1 e pode encerrar o script
# com erro. Use sempre "if [ teste ]; then comando; fi".
# =============================================================
set -euo pipefail

# Vai para a raiz do projeto, de onde quer que o script seja chamado
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [ ! -f _quarto.yml ]; then
  echo "ERRO: não encontrei _quarto.yml em $(pwd)." >&2
  echo "O script deve ficar na pasta scripts/ do projeto do site." >&2
  exit 1
fi

# O "find" precisa ser o do Git Bash/Linux, e não o FIND.EXE do Windows
if ! find . -maxdepth 0 -print0 > /dev/null 2>&1; then
  echo "ERRO: o comando 'find' disponível não é o do Git Bash." >&2
  echo "Rode este script no terminal Git Bash." >&2
  exit 1
fi

# ImageMagick 7 (padrão no Windows e no macOS) usa "magick identify" e
# "magick <entrada> ... <saída>"; o ImageMagick 6 (Linux e GitHub Actions)
# usa "identify" e "convert". O script detecta qual está disponível.
if command -v magick > /dev/null 2>&1; then
  IDENTIFY=(magick identify)
  CONVERTER=(magick)
elif command -v identify > /dev/null 2>&1 && command -v convert > /dev/null 2>&1; then
  IDENTIFY=(identify)
  CONVERTER=(convert)
else
  echo "ERRO: ImageMagick não encontrado. Instale e reabra o terminal." >&2
  exit 1
fi

QUALIDADE=82
VERBOSO="${VERBOSO:-0}"   # VERBOSO=1 lista também as fotos que já estão ok
processadas=0
erros=0
economia_kb=0

# otimizar <pasta> <lado maior em pixels>
otimizar() {
  local pasta="$1" limite="$2"
  if [ ! -d "$pasta" ]; then
    echo "- ${pasta}/: pasta não existe, ignorada"
    return 0
  fi

  local fotos=()
  while IFS= read -r -d '' f; do fotos+=("$f"); done < <(
    find "$pasta" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) -print0
  )
  echo "- ${pasta}/: ${#fotos[@]} foto(s) encontrada(s), limite ${limite} px"

  local foto saida largura altura exif antes depois
  for foto in "${fotos[@]}"; do
    # Lê as dimensões (só a saída normal; avisos vão para outro canal).
    # "tr -d '\r'" remove o fim de linha do Windows.
    saida=$("${IDENTIFY[@]}" -format '%w %h' "${foto}[0]" 2> /dev/null | tr -d '\r') || true
    read -r largura altura <<< "$saida"
    if ! [[ "${largura:-}" =~ ^[0-9]+$ && "${altura:-}" =~ ^[0-9]+$ ]]; then
      echo "    ERRO ao ler ${foto}:"
      echo "      $("${IDENTIFY[@]}" "${foto}[0]" 2>&1 > /dev/null | head -n 3)"
      erros=$((erros + 1)); continue
    fi
    exif=$("${IDENTIFY[@]}" -format '%[exif:*]' "${foto}[0]" 2>/dev/null | tr -d '\r\n' | head -c 1 || true)

    # Só processa se a foto é grande demais ou ainda tem metadados
    if [ "$largura" -gt "$limite" ] || [ "$altura" -gt "$limite" ] || [ -n "$exif" ]; then
      antes=$(du -k "$foto" | cut -f1)
      # Gera a versão otimizada num arquivo temporário e só depois substitui
      # a original. Assim, uma falha nunca deixa uma foto pela metade, e dá
      # para saber se o problema foi ao gerar a foto ou ao substituir o arquivo.
      local ext="${foto##*.}"
      local tmp="${TMPDIR:-/tmp}/otimizar-$$-${processadas}-${erros}.$(printf "%s" "$ext" | tr "A-Z" "a-z")"
      # -auto-orient ANTES de -strip: celulares gravam a rotação no EXIF;
      # sem isso, a foto ficaria deitada depois de remover os metadados.
      local codigo=0
      saida=$("${CONVERTER[@]}" "${foto}[0]" -auto-orient -resize "${limite}x${limite}>" \
                -strip -quality "$QUALIDADE" "$tmp" 2>&1) || codigo=$?
      # O ImageMagick também devolve código de erro para simples avisos;
      # o que importa é se a foto otimizada foi gerada e pode ser lida.
      if [ ! -s "$tmp" ] || ! "${IDENTIFY[@]}" "$tmp" > /dev/null 2>&1; then
        echo "    ERRO ao otimizar ${foto} (código ${codigo}):"
        echo "      ${saida:-sem mensagem do ImageMagick}"
        rm -f "$tmp"
        erros=$((erros + 1)); continue
      fi
      if [ -n "$saida" ]; then
        echo "    aviso do ImageMagick em ${foto}: ${saida}"
      fi
      # Remove o atributo "somente leitura" (comum no Windows) e substitui
      chmod u+w "$foto" 2> /dev/null || true
      if ! saida=$(mv -f "$tmp" "$foto" 2>&1); then
        echo "    ERRO ao substituir ${foto}: ${saida}"
        echo "      A foto otimizada foi gerada, mas o arquivo original não pôde ser"
        echo "      sobrescrito (arquivo aberto em outro programa, pasta protegida"
        echo "      ou sincronizada pelo OneDrive)."
        rm -f "$tmp"
        erros=$((erros + 1)); continue
      fi
      depois=$(du -k "$foto" | cut -f1)
      echo "    ${foto}: ${largura}x${altura}, ${antes} KB -> ${depois} KB"
      processadas=$((processadas + 1))
      economia_kb=$((economia_kb + antes - depois))
    elif [ "$VERBOSO" = "1" ]; then
      echo "    ok: ${foto} (${largura}x${altura})"
    fi
  done
}

echo "Projeto: $(pwd)"
echo "ImageMagick: $("${CONVERTER[@]}" -version 2>&1 | head -n 1 | tr -d '\r')"
otimizar eventos      1600   # capas e galerias de eventos
otimizar projetos     1600   # capas de projetos
otimizar noticias     1600   # capas e fotos de notícias
otimizar equipe/fotos  600   # fotos da equipe (exibidas com 140 px)

# Formato de foto do iPhone que a maioria dos navegadores não exibe
heic=$(find eventos projetos noticias equipe -type f \( -iname '*.heic' -o -iname '*.heif' \) 2>/dev/null || true)
if [ -n "$heic" ]; then
  echo "ATENÇÃO: fotos em HEIC não aparecem na maioria dos navegadores."
  echo "Converta para JPG antes de enviar:"
  echo "$heic"
fi

echo "Fotos otimizadas: ${processadas}; erros: ${erros}; espaço economizado: ${economia_kb} KB"

# Resumo na página da execução, quando roda no GitHub Actions
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Otimização de fotos"
    echo "- Fotos otimizadas: **${processadas}**"
    echo "- Erros: **${erros}**"
    echo "- Espaço economizado: **${economia_kb} KB**"
    if [ -n "$heic" ]; then
      echo "- ⚠️ Há fotos em HEIC, que precisam ser convertidas para JPG."
    fi
  } >> "$GITHUB_STEP_SUMMARY"

  # Alertas visíveis no topo da página da execução no GitHub
  if [ "$erros" -gt 0 ]; then
    echo "::warning title=Otimização de fotos::${erros} foto(s) com erro; veja o log deste passo."
  fi
  if [ -n "$heic" ]; then
    echo "::warning title=Fotos em HEIC::Há fotos em HEIC, que a maioria dos navegadores não exibe."
  fi
fi

# Erros em fotos individuais não impedem a publicação do site:
# eles aparecem no log e como alerta na página da execução.
exit 0
