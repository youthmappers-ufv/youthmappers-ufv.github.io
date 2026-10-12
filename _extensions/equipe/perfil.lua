--[[
  Páginas de perfil (equipe/*.qmd): preenche o texto abaixo do nome
  (description) com o cargo, a função e o curso calculados por
  scripts/gerar-dados.ts. Um "description" escrito no arquivo tem prioridade.
  Também acrescenta o botão "OpenStreetMap" a partir do campo "osm" do cabeçalho e, para quem
  tem "estatisticas: true", a seção "Estatísticas no OpenStreetMap" (estatisticas.js).
]]
local comum = dofile(quarto.utils.resolve_path("comum.lua"))

-- "Fulano de Tal" -> "Fulano%20de%20Tal" (usuário do OSM pode ter espaços e acentos)
local function codificar(texto)
  return (texto:gsub("[^%w%-%._~]", function(c) return string.format("%%%02X", string.byte(c)) end))
end

-- Endereço do perfil no OSM, a partir do campo "osm" do cabeçalho (aceita o usuário ou o endereço do perfil)
local function endereco_osm(meta)
  if not meta.osm then return nil end
  local usuario = pandoc.utils.stringify(meta.osm)
  if usuario == "" then return nil end
  return usuario:match("^https?://") and usuario or ("https://www.openstreetmap.org/user/" .. codificar(usuario))
end

-- O Quarto monta o bloco de links ("about.links") antes dos filtros e não o expõe a eles.
-- Por isso o botão é acrescentado por um pequeno script, que só age se a página ainda não
-- tiver um link para openstreetmap.org (por exemplo, escrito em "about: links:").
local function script_osm(href)
  local dados = pandoc.json.encode(href):gsub("<", string.char(92) .. "u003c")
  return [[<script>
window.addEventListener('load', function () {
  var entidade = document.querySelector('.about-entity');
  if (!entidade || entidade.querySelector('a[href*="openstreetmap.org"]')) return;
  var caixa = entidade.querySelector('.about-links');
  if (!caixa) { caixa = document.createElement('div'); caixa.className = 'about-links'; entidade.appendChild(caixa); }
  var a = document.createElement('a');
  a.className = 'about-link'; a.href = ]] .. dados .. [[; a.rel = 'noopener'; a.target = '_blank';
  a.innerHTML = '<i class="bi bi-geo-alt"></i> <span class="about-link-text">OpenStreetMap</span>';
  caixa.appendChild(a);
});
</script>]]
end

return {
  {
    Meta = function(meta)
      if meta.description then return nil end
      local entrada = quarto.doc.input_file or ""
      local id = entrada:match("([^/\\]+)%.qmd$")
      local dados = comum.dados_equipe()
      if not (id and dados and dados.perfis and dados.perfis[id]) then return nil end
      meta.description = pandoc.MetaInlines(pandoc.Inlines(dados.perfis[id].descricao))
      return meta
    end,
  },
  {
    Pandoc = function(doc)
      local mudou = false
      local href = endereco_osm(doc.meta)
      if href then
        doc.blocks:insert(pandoc.RawBlock("html", script_osm(href)))
        mudou = true
      end
      -- Estatísticas de edição: só para quem tem "estatisticas: true" (presente em estatisticas.json)
      local entrada = (quarto.doc.input_file or ""):gsub(string.char(92), "/")
      local id = entrada:match("([^/]+)%.qmd$")
      local est = id and comum.estatisticas()
      if est and est.membros then
        for _, m in ipairs(est.membros) do
          if m.id == id then
            comum.dependencia_estatisticas()
            local dados = comum.json_embutido({ meses_recentes = est.meses_recentes, gerado_em = est.gerado_em,
                                                hashtags = est.hashtags, membro = m })
            doc.blocks:insert(pandoc.RawBlock("html",
              '<section class="estatisticas-osm" aria-labelledby="est-titulo"><h2 id="est-titulo">Estatísticas no OpenStreetMap</h2>' ..
              '<div class="est-corpo"></div><script type="application/json" class="est-dados">' .. dados .. "</script></section>"))
            mudou = true
          end
        end
      end
      return mudou and doc or nil
    end,
  },
}
