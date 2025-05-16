import { NextRequest, NextResponse } from 'next/server';
import { LangchainToolset } from '@composio/langchain';
import { Composio } from '@composio/core';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get('connectionId');
  const composioApiKey = searchParams.get('composioApiKey');
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
  }
  if (!composioApiKey) {
    return NextResponse.json({ error: 'composioApiKey is required' }, { status: 400 });
  }
  const composio = new Composio({
    apiKey: composioApiKey,
    toolset: new LangchainToolset(),
  });
  try {
    const account = await composio.connectedAccounts.get(connectionId);
    if (account && account.status === 'ACTIVE') {
      return NextResponse.json({ status: 'connected' });
    } else {
      return NextResponse.json({ status: 'waiting', rawStatus: account?.status });
    }
  } catch (err) {
    return NextResponse.json({ status: 'error', error: 'Failed to fetch connection status' }, { status: 500 });
  }
} 