import { intentClassifierService } from '../../src/modules/engineering-assistant/services/core/intent-classifier.service';

async function test() {
  const query = 'how to write a react component';
  const result = await intentClassifierService.classifyWithEnsemble(query);
  console.log('Intent Result:', result);
  process.exit(0);
}
test();
