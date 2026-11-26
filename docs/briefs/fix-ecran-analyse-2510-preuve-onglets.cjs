const { chromium } = require('playwright')
const html = (
  shrink,
  h,
) => `<body style="margin:0"><div style="height:${h}px;display:flex;flex-direction:column;width:900px">
<div style="height:40px;flex:none">barre En cours</div>
<div id="col" style="display:flex;flex-direction:column;height:${h - 40}px">
<div id="tabs" style="display:flex;overflow-x:auto;${shrink ? 'flex-shrink:0;' : ''}padding:4px;border:1px solid #888"><button style="min-height:44px">Une entreprise</button><button style="min-height:44px">Un contact</button></div>
<div style="flex:1 1 0;display:flex"><div style="flex:1;overflow:hidden;padding:28px;min-height:900px">carte</div></div></div></div></body>`
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage()
  for (const h of [900, 768, 500])
    for (const shrink of [false, true]) {
      await p.setContent(html(shrink, h))
      console.log(
        'viewport',
        h,
        'shrink-0',
        shrink,
        'tabs height',
        await p.$eval('#tabs', e => Math.round(e.getBoundingClientRect().height)),
      )
    }
  await b.close()
})()
