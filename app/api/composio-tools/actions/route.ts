import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const toolkitSlug = searchParams.get('toolkitSlug');

  if (!toolkitSlug) {
    return NextResponse.json({ error: 'Missing toolkitSlug parameter' }, { status: 400 });
  }

  try {
    const filePath = path.join(process.cwd(), 'app/api/composio-tools/actions.json');
    const file = await fs.readFile(filePath, 'utf-8');
    const actionsResponse = JSON.parse(file);

    if (!actionsResponse || !Array.isArray(actionsResponse.items)) {
      return NextResponse.json({ error: 'Invalid actions file format' }, { status: 500 });
    }

    const filteredActions = actionsResponse.items.filter((action: any) =>
      action.appId === toolkitSlug ||
      action.appKey === toolkitSlug ||
      action.appName === toolkitSlug
    );

    return NextResponse.json({ actions: filteredActions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 