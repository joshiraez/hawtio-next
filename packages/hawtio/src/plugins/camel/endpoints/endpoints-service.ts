import { eventService, NotificationType } from '@hawtiosrc/core'
import { jolokiaService } from '@hawtiosrc/plugins/connect'
import * as schema from '@hawtio/camel-model'
import { MBeanNode, workspace } from '@hawtiosrc/plugins/shared'
import * as ccs from '../camel-content-service'
import { getDefaultRuntimeEndpointRegistry } from '../camel-content-service'
import { contextNodeType, endpointsType, log } from '../globals'
import { isObject } from '@hawtiosrc/util/objects'
import { parseXML } from '@hawtiosrc/util/xml'

export type Endpoint = {
  uri: string
  state: string
  mbean: string
}

export type EndpointStatistics = {
  hits: number
  routeId: string
  static: boolean
  index: number
  dynamic: boolean
  url: string
  direction: string
  [key: string]: string | boolean | number
}

export type MessageData = {
  messageId: string
  body: string
  headers: { key: string; type: string; value: string }[]
}
export async function getEndpoints(node: MBeanNode): Promise<Endpoint[]> {
  const endpoints: Endpoint[] = []
  const ctxNode = ccs.findContext(node)
  if (!ctxNode || ctxNode.childCount() === 0) return endpoints

  const endPointsNode = ctxNode.get(endpointsType) as MBeanNode
  for (const ep of endPointsNode.getChildren()) {
    if (!ep.objectName) continue
    const attributes = await jolokiaService.readAttributes(ep.objectName)
    endpoints.push({
      uri: attributes.EndpointUri as string,
      state: attributes.State as string,
      mbean: ep.objectName,
    })
  }

  return endpoints
}

export function canCreateEndpoints(node: MBeanNode | null): boolean {
  return node ? workspace.hasInvokeRights(node, 'createEndpoint') : false
}

export async function componentNames(node: MBeanNode): Promise<string[]> {
  const ctxNode = ccs.findContext(node)
  if (!ctxNode || ctxNode.childCount() === 0 || !ctxNode.objectName) return []

  const names = await jolokiaService.execute(ctxNode.objectName, 'componentNames')
  return names as string[]
}

function notifyError(msg: string) {
  eventService.notify({
    type: 'danger',
    message: msg,
  })
}

export async function createEndpoint(node: MBeanNode, name: string) {
  const ctxNode = ccs.findContext(node)
  if (!ctxNode) {
    notifyError('Could not find the CamelContext!')
    return
  }

  if (!ctxNode.objectName) {
    notifyError('Could not find the CamelContext MBean!')
    return
  }

  jolokiaService
    .execute(ctxNode.objectName, 'createEndpoint(java.lang.String)', [name])
    .then((value: unknown) => {
      if (value === true) {
        workspace.refreshTree()
        eventService.notify({
          type: 'success',
          message: 'Creating endpoint',
          duration: 3000,
        })
      } else {
        eventService.notify({
          type: 'danger',
          message: 'Invalid URI',
        })
      }
    })
    .catch((error: string) => {
      error = error.replace('org.apache.camel.ResolveEndpointFailedException : ', '')
      eventService.notify({
        type: 'danger',
        message: error,
      })
    })
}

export function createEndpointFromData(
  node: MBeanNode,
  componentName: string,
  endPointPath: string,
  parameters: Record<string, string>,
) {
  if (!componentName) console.error('createEndpointFromData: component name must be defined')

  if (!endPointPath) console.error('createEndpointFromData: endpoint path must be defined')

  log.debug('Have endpoint data ' + JSON.stringify(parameters))

  const uri =
    componentName +
    '://' +
    endPointPath +
    (parameters
      ? '?' +
        Object.entries(parameters)
          .map(entry => entry.join('='))
          .join('&')
      : '')

  log.debug('Creating endpoint for uri: ' + uri)
  createEndpoint(node, uri)
}

export function loadEndpointSchema(node: MBeanNode, componentName: string): Record<string, unknown> | null {
  const ctxNode = ccs.findContext(node)
  if (!ctxNode) {
    eventService.notify({
      type: 'danger',
      message: 'Could not find the CamelContext!',
    })
    return null
  }

  if (!componentName) return null

  if (!schema) return null

  if (!isObject(schema.components)) return null

  const compSchema: Record<string, unknown> = schema.components.components
  return compSchema[componentName] as Record<string, unknown>
}

export async function doSendMessage(
  mbean: MBeanNode,
  body: string,
  headers: { name: string; value: string }[],
  notify: (type: NotificationType, message: string) => void,
) {
  const messageHeaders: Record<string, string> = {}
  if (headers.length > 0) {
    headers.forEach(header => {
      const key = header.name
      if (key && key !== '') {
        messageHeaders[key] = header.value
      }
    })
  }

  const context = mbean.parent?.getProperty(contextNodeType)
  const uri = mbean.name
  if (context && uri) {
    let ok = true

    const reply = await jolokiaService.execute(context, 'canSendToEndpoint(java.lang.String)', [uri])
    if (!reply) {
      notify('warning', 'Camel does not support sending to this endpoint.')
      ok = false
    }

    if (ok) {
      if (Object.keys(messageHeaders).length > 0) {
        jolokiaService
          .execute(context, 'sendBodyAndHeaders(java.lang.String, java.lang.Object, java.util.Map)', [
            uri,
            body,
            messageHeaders,
          ])
          .then(ok => {
            notify('success', `Message and headers were sent to the ${uri} endpoint`)
          })
      } else {
        jolokiaService.execute(context, 'sendStringBody(java.lang.String, java.lang.String)', [uri, body]).then(ok => {
          notify('success', `Message was sent to the ${uri} endpoint`)
        })
      }
    }
  } else {
    if (!mbean) {
      notify('danger', 'Could not find CamelContext MBean!')
    } else {
      notify('danger', 'Failed to determine endpoint name!')
    }
    log.debug('Parsed context and endpoint:', context, mbean)
  }
}

export async function forwardMessagesToEndpoint(
  mBean: MBeanNode,
  uri: string,
  messages: MessageData[],
  notify: (type: NotificationType, message: string) => void,
) {
  const context = mBean.parent?.getProperty(contextNodeType)

  if (context && uri && messages && messages.length) {
    try {
      await jolokiaService.execute(context, 'createEndpoint(java.lang.String)', [uri])
    } catch (err) {
      notify('danger', `Error: ${err}`)
      return
    }

    let forwarded = 0
    for (const message of messages) {
      const body = message.body
      const messageHeaders: Record<string, string> = {}
      if (message.headers.length > 0) {
        message.headers.forEach(header => {
          if (header.key && header.key !== '') {
            messageHeaders[header.key] = header.value
          }
        })
      }
      try {
        await jolokiaService.execute(context, 'sendBodyAndHeaders(java.lang.String, java.lang.Object, java.util.Map)', [
          uri,
          body,
          messageHeaders,
        ])
        forwarded++
      } catch (err) {
        notify('danger', `Error: ${err}`)
        return
      }
    }
    const m = forwarded > 1 ? 'messages' : 'message'
    notify('success', `Forwarded ${forwarded} ${m} to endpoint ${uri}`)
  }
}
export async function getMessagesFromTheEndpoint(mbean: MBeanNode, from: number, to: number): Promise<MessageData[]> {
  let messageData: MessageData[] = []
  const context = mbean.parent?.getProperty(contextNodeType)
  const browseAll = to === -1
  if (context) {
    let reply
    if (browseAll) {
      reply = await jolokiaService.execute(mbean.objectName ?? '', 'browseAllMessagesAsXml(java.lang.Boolean)', [true])
    } else {
      reply = await jolokiaService.execute(
        mbean.objectName ?? '',
        'browseRangeMessagesAsXml(java.lang.Integer,java.lang.Integer, java.lang.Boolean)',
        [from, to, true],
      )
    }
    const messagesXml = parseXML(reply as string)
    messageData = parseMessagesFromXml(messagesXml)
  }
  return messageData
}

function parseMessagesFromXml(pDoc: XMLDocument): MessageData[] {
  const messagesData: MessageData[] = []
  const messages = pDoc.getElementsByTagName('message')
  for (const message of messages) {
    const headers: { key: string; type: string; value: string }[] = []
    for (const header of message.getElementsByTagName('header')) {
      headers.push({
        key: header.getAttribute('key') ?? '',
        value: header.textContent ?? '',
        type: header.getAttribute('type') ?? '',
      })
    }
    messagesData.push({
      messageId: message.getAttribute('exchangeId') ?? '',
      body: message.getElementsByTagName('body')[0].textContent ?? '',
      headers: headers,
    })
  }

  return messagesData
}

export async function getEndpointStatistics(node: MBeanNode) {
  let stats: EndpointStatistics[] = []
  const registry = getDefaultRuntimeEndpointRegistry(node)
  if (registry && registry.objectName) {
    const res = await jolokiaService.execute(registry.objectName, 'endpointStatistics()')
    stats = Object.values(res as { [key: string]: EndpointStatistics })
  } else {
    log.error('Error with the retrieving the registry')
  }
  return stats
}
