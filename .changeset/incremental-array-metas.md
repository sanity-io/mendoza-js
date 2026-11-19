---
'mendoza': patch
---

fix: array element metas in the incremental patcher now keep their origin when elements stay in place

Previously, any patch that rebuilt an array gave every element in it the meta of that patch.
