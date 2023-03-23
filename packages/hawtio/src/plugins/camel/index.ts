import { hawtio } from '@hawtiosrc/core'
import { helpRegistry } from '@hawtiosrc/help/registry'
import { treeProcessorRegistry, workspace } from '@hawtiosrc/plugins/shared'
import { jmxDomain, pluginPath } from './globals'
import { camelTreeProcessor } from './tree-processor'
// import { preferencesRegistry } from '@hawtiosrc/preferences/registry'
import { Camel } from './Camel'
// import { CamelPreferences } from './CamelPreferences'
import help from './help.md'
// import { jolokiaService } from './jolokia-service'

export const camel = () => {
  hawtio.addPlugin({
    id: 'camel',
    title: 'Camel',
    path: pluginPath,
    component: Camel,
    isActive: async () => {
      return workspace.treeContainsDomainAndProperties(jmxDomain)
    },
  })

  treeProcessorRegistry.add('camel', camelTreeProcessor)
  helpRegistry.add('camel', 'Camel', help, 13)
  // preferencesRegistry.add('camel', 'Camel', ConnectPreferences, 11)
}
