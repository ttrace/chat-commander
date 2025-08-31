import fs from 'fs';
import path from 'path';
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const scenariosDir = path.join(process.cwd(), 'scenarios');
  const result: Array<{ id: string; title: string }> = [];

  fs.readdirSync(scenariosDir).forEach((dir) => {
    const scenarioFile = path.join(scenariosDir, dir, 'scenario.json');
    if (fs.existsSync(scenarioFile)) {
      try {
        const obj = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));
        result.push({ id: dir, title: obj.title ?? dir });
      } catch {
        // ignore parse errors
      }
    }
  });

  res.status(200).json(result);
}