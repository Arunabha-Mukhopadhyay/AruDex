import express from 'express'
import cors from 'cors'

import {ammCalculation} from './ammCal.js'

const app = express()
app.use(cors());
app.use(express.json())


app.get('/api/amm', async (req, res) => {
  try {
    const result = await ammCalculation();
    res.json({ ok: true, result });
  } catch (error) {
    return res.status(404).json({ ok: false, error: error.message });
  }
});

app.listen(3000,()=>{
  console.log(`app is running at port 3000`)
})