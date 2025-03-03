import { jolokiaService } from '@hawtiosrc/plugins/connect/jolokia-service'
import { log } from '../globals'
import { escapeMBean } from '@hawtiosrc/util/jolokia'

class OperationService {
  async execute(mbean: string, operation: string, args: unknown[]): Promise<unknown> {
    log.debug('Execute:', mbean, '-', operation, '-', args)
    return jolokiaService.execute(mbean, operation, args)
  }

  async getJolokiaUrl(mbean: string, operation: string): Promise<string> {
    //Ideally this would be provided by jolokia but it doesn't expose that API yet
    const mbeanName = escapeMBean(mbean)
    return `${await jolokiaService.getJolokiaUrl()}/exec/${mbeanName}/${operation}`
  }
}

export const operationService = new OperationService()
