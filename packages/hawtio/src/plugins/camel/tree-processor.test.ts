import { jolokiaService } from '@hawtiosrc/plugins/connect/jolokia-service'
import { MBeanNode, MBeanTree, workspace } from '@hawtiosrc/plugins/shared'
import fs from 'fs'
import path from 'path'
import * as ccs from './camel-content-service'
import {
  camelContexts,
  componentsType,
  contextNodeType,
  contextsType,
  endpointsType,
  jmxDomain,
  mbeansType,
  routeNodeType,
  routesType,
} from './globals'
import { camelTreeProcessor } from './tree-processor'

jest.mock('@hawtiosrc/plugins/connect/jolokia-service')

const CAMEL_MODEL_VERSION = '3.20.2'

/**
 * This has to be outside of the describe and test blocks.
 * Otherwise, it is ignored & the real function is used
 */
jest.mock('./camel-content-service', () => {
  return {
    ...jest.requireActual('./camel-content-service'),
    setCamelVersion: jest.fn((contextNode: MBeanNode | null) => {
      if (contextNode) contextNode.addProperty('version', CAMEL_MODEL_VERSION)
    }),
  }
})

describe('tree-processor', () => {
  let tree: MBeanTree

  const routesXmlPath = path.resolve(__dirname, 'testdata', 'camel-sample-app-routes.xml')
  const routesWithGroupsXmlPath = path.resolve(__dirname, 'testdata', 'camel-sample-app-routes-with-groups.xml')
  const routesWithSingleGroupXmlPath = path.resolve(
    __dirname,
    'testdata',
    'camel-sample-app-routes-with-single-group.xml',
  )
  let sampleRoutesXml = fs.readFileSync(routesXmlPath, { encoding: 'utf8', flag: 'r' })

  jolokiaService.execute = jest.fn(async (mbean: string, operation: string, args?: unknown[]): Promise<unknown> => {
    if (
      mbean === 'org.apache.camel:context=SampleCamel,type=context,name="SampleCamel"' &&
      operation === 'dumpRoutesAsXml()'
    ) {
      return sampleRoutesXml
    }

    return ''
  })

  beforeEach(async () => {
    tree = await workspace.getTree()
    workspace.refreshTree()
    sampleRoutesXml = fs.readFileSync(routesXmlPath, { encoding: 'utf8', flag: 'r' })
  })

  test('processor', async () => {
    expect(tree.isEmpty()).toBeFalsy()

    await camelTreeProcessor(tree)

    const domainNode: MBeanNode = tree.get(jmxDomain) as MBeanNode
    expect(domainNode).not.toBeNull()
    expect(domainNode.childCount()).toBe(1)

    const contextsNode = domainNode.getIndex(0) as MBeanNode
    expect(contextsNode).not.toBeNull()
    expect(ccs.hasDomain(contextsNode)).toBeTruthy()
    expect(ccs.hasType(contextsNode, contextsType)).toBeTruthy()
    expect(contextsNode.id).toBe('org.apache.camel-folder-CamelContexts-folder')
    expect(contextsNode.name).toBe(camelContexts)
    expect(contextsNode.childCount()).toBe(1)

    const contextNode = contextsNode.getIndex(0) as MBeanNode
    expect(ccs.hasDomain(contextNode)).toBeTruthy()
    expect(ccs.hasType(contextNode, contextNodeType)).toBeTruthy()
    expect(contextNode.id).toBe('org.apache.camel-folder-CamelContexts-folder-SampleCamel-folder')
    expect(contextNode.name).toBe('SampleCamel')
    expect(ccs.getCamelVersion(contextNode)).toBe(CAMEL_MODEL_VERSION)
    expect(contextNode.childCount()).toBe(4)

    const types = [routesType, endpointsType, componentsType, mbeansType]
    for (const type of types) {
      const node = contextNode.get(type) as MBeanNode
      expect(node).toBeDefined()
      expect(ccs.hasDomain(node)).toBeTruthy()
      expect(ccs.hasType(node, type)).toBeTruthy()
      expect(node.id).toEqual(`org.apache.camel-folder-CamelContexts-folder-SampleCamel-folder-${type}-folder`)
      expect(node.name).toBe(type)
      expect(ccs.getCamelVersion(node)).toBe(CAMEL_MODEL_VERSION)
      expect(node.childCount()).toBeGreaterThan(0)
    }

    const routesNode = contextNode.get(routesType) as MBeanNode
    for (const child of routesNode.getChildren()) {
      expect(child).toBeDefined()
      expect(ccs.hasDomain(child)).toBeTruthy()
      expect(ccs.hasType(child, routeNodeType)).toBeTruthy()
    }
  })

  test('processor-with-single-group', async () => {
    sampleRoutesXml = fs.readFileSync(routesWithSingleGroupXmlPath, { encoding: 'utf8', flag: 'r' })
    expect(tree.isEmpty()).toBeFalsy()

    await camelTreeProcessor(tree)

    const domainNode: MBeanNode = tree.get(jmxDomain) as MBeanNode
    expect(domainNode).not.toBeNull()
    expect(domainNode.childCount()).toBe(1)

    const contextsNode = domainNode.getIndex(0) as MBeanNode
    expect(contextsNode).not.toBeNull()

    const contextNode = contextsNode.getIndex(0) as MBeanNode
    expect(contextNode).toBeDefined()
    expect(contextNode.childCount()).toBe(4)

    const routesNode = contextNode.get(routesType) as MBeanNode
    expect(routesNode).toBeDefined()
    expect(routesNode.childCount()).toBe(2)

    const group1Node = routesNode.get('group1') as MBeanNode
    expect(group1Node).toBeDefined()
    expect(group1Node.childCount()).toBe(1)

    // non-grouped route added under default route group
    const defaultNode = routesNode.get('default') as MBeanNode
    expect(defaultNode).toBeDefined()
    expect(defaultNode.childCount()).toBe(1)
  })

  test('processor-with-groups', async () => {
    sampleRoutesXml = fs.readFileSync(routesWithGroupsXmlPath, { encoding: 'utf8', flag: 'r' })
    expect(tree.isEmpty()).toBeFalsy()

    await camelTreeProcessor(tree)

    const domainNode: MBeanNode = tree.get(jmxDomain) as MBeanNode
    expect(domainNode).not.toBeNull()
    expect(domainNode.childCount()).toBe(1)

    const contextsNode = domainNode.getIndex(0) as MBeanNode
    expect(contextsNode).not.toBeNull()

    const contextNode = contextsNode.getIndex(0) as MBeanNode
    expect(contextNode).toBeDefined()
    expect(contextNode.childCount()).toBe(4)

    const routesNode = contextNode.get(routesType) as MBeanNode
    expect(routesNode).toBeDefined()
    expect(routesNode.childCount()).toBe(2)

    const group1Node = routesNode.get('group1') as MBeanNode
    expect(group1Node).toBeDefined()
    expect(group1Node.childCount()).toBe(1)

    const group2Node = routesNode.get('group2') as MBeanNode
    expect(group2Node).toBeDefined()
    expect(group2Node.childCount()).toBe(1)
  })
})
