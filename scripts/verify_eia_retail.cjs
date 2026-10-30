// Uses only EIA retail observations and the existing price-free wholesale directory.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
;(async () => {
  const browser = await chromium.launch({headless:true})
  const output = process.env.EIA_TEST_OUTPUT || '/tmp/eia-browser-evidence'
  fs.mkdirSync(output,{recursive:true})
  const errors=[], calls=[]
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100}})
    page.on('pageerror',e=>errors.push(e.message))
    page.on('request',r=>calls.push(r.url()))
    const incoming=page.waitForResponse(r=>r.url().endsWith('/api/retail-prices'))
    await page.goto('http://127.0.0.1:5191')
    const response=await incoming
    assert.equal(response.status(),200)
    const data=await response.json()
    assert.equal(data.states.length,51)
    await page.locator('.retail-panel .market-price').filter({hasText:data.states.find(s=>s.state==='California').cents_per_kwh.toFixed(2)}).waitFor()
    for(const name of ['Texas','New York','Hawaii','Alaska','District of Columbia']) {
      await page.locator('#retail-state').selectOption(name)
      const row=data.states.find(s=>s.state===name)
      assert((await page.locator('.retail-panel .market-price').innerText()).includes(row.cents_per_kwh.toFixed(2)))
    }
    await page.getByRole('button',{name:'Select California',exact:true}).focus()
    await page.keyboard.press('Enter')
    assert.equal(await page.locator('#retail-state').inputValue(),'California')
    await page.locator('.retail-panel').screenshot({path:`${output}/desktop.png`})
    // Both real optimization modes retain the original commercial tariff.
    const tariffs=[]
    for(const mode of ['ev_only','joint']) {
      await page.locator('#scheduling-mode').selectOption(mode)
      const optimized=page.waitForResponse(r=>r.url().includes(`/api/optimize?scheduling_mode=${mode}`)&&r.request().method()==='POST')
      await page.getByRole('button',{name:'Run optimization',exact:true}).click()
      const r=await optimized
      assert.equal(r.status(),200)
      tariffs.push(r.request().postDataJSON().electricity_prices_usd_per_kwh)
    }
    assert.deepEqual(tariffs[0],tariffs[1])
    await page.getByRole('navigation').getByRole('button',{name:'Energy overview',exact:true}).click()
    await page.setViewportSize({width:390,height:844})
    await page.locator('#retail-state').selectOption('Texas')
    await page.locator('.retail-panel .market-price').filter({hasText:data.states.find(s=>s.state==='Texas').cents_per_kwh.toFixed(2)}).waitFor()
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    await page.locator('#retail-state').focus()
    await page.locator('#retail-state').blur()
    await page.locator('.retail-panel').screenshot({path:`${output}/mobile.png`})
    await page.getByRole('button',{name:'Wholesale market directory',exact:true}).click()
    await page.getByRole('button',{name:'NYISO',exact:true}).click()
    assert((await page.locator('.market-price').innerText()).includes('—'))
    assert((await page.locator('.wholesale-withheld').innerText()).includes('withheld'))
    assert(!calls.some(url=>/market-prices|kardashev|misoenergy|nysdi|api.pjm|portal.spp/.test(url)))
    await page.route('**/api/retail-prices',r=>r.fulfill({status:200,json:{...data,status:'saved',notice:'Refresh unavailable. Showing the saved EIA release.'}}))
    await page.getByRole('button',{name:'State retail averages',exact:true}).click()
    await page.getByText('Saved release · refresh unavailable',{exact:true}).waitFor()
    await page.route('**/api/retail-prices',r=>r.fulfill({status:503,json:{}}))
    await page.reload()
    await page.getByText('Data unavailable',{exact:true}).waitFor()
    assert((await page.locator('.retail-panel .market-price').innerText()).includes('—'))
    assert.deepEqual(errors,[])
    fs.writeFileSync(`${output}/browser-results.json`,JSON.stringify({passed:true,areas:51,mobile:true,keyboard:true,optimizer_tariff_unchanged:true,wholesale_prices_withheld:true,saved_and_unavailable:true,errors},null,2))
  } finally { await browser.close() }
})().catch(e=>{console.error(e);process.exit(1)})
