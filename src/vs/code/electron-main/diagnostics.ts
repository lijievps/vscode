/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { WorkspaceStats, collectWorkspaceStats, collectLaunchConfigs, WorkspaceStatItem } from 'vs/base/node/stats';
import { IMainProcessInfo } from 'vs/code/electron-main/launch';
import { ProcessItem, listProcesses } from 'vs/base/node/ps';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import * as os from 'os';
import { virtualMachineHint } from 'vs/base/node/id';
import { repeat, pad } from 'vs/base/common/strings';
import { isWindows } from 'vs/base/common/platform';
import { app } from 'electron';
import { basename } from 'path';

export function printDiagnostics(info: IMainProcessInfo): Promise<any> {
	return listProcesses(info.mainPID).then(rootProcess => {

		// Environment Info
		console.log('');
		console.log(formatEnvironment(info));

		// Process List
		console.log('');
		console.log(formatProcessList(info, rootProcess));

		// Workspace Stats
		if (info.windows.some(window => window.folders && window.folders.length > 0)) {
			console.log('');
			console.log('Workspace Stats: ');
			info.windows.forEach(window => {
				if (window.folders.length === 0) {
					return;
				}

				console.log(`|  Window (${window.title})`);

				window.folders.forEach(folder => {
					console.log(`|    Folder (${basename(folder)})`);
					const stats = collectWorkspaceStats(folder, ['node_modules', '.git']);
					console.log(formatWorkspaceStats(stats));

					const launchConfigs = collectLaunchConfigs(folder);
					if (launchConfigs.length > 0) {
						console.log(formatLaunchConfigs(launchConfigs));
					}
				});
			});
		}
		console.log('');
		console.log('');
	});
}

function formatWorkspaceStats(workspaceStats: WorkspaceStats): string {
	const output: string[] = [];
	const lineLength = 60;
	let col = 0;

	const appendAndWrap = (name: string, count: number) => {
		const item = count > 1 ? ` ${name}(${count})` : ` ${name}`;

		if (col + item.length > lineLength) {
			output.push(line);
			line = '|                 ';
			col = line.length;
		}
		else {
			col += item.length;
		}
		line += item;
	};


	// File Types
	let line = '|      File types:';
	const maxShown = 10;
	let max = workspaceStats.fileTypes.length > maxShown ? maxShown : workspaceStats.fileTypes.length;
	for (let i = 0; i < max; i++) {
		const item = workspaceStats.fileTypes[i];
		appendAndWrap(item.name, item.count);
	}
	output.push(line);

	// Conf Files
	if (workspaceStats.configFiles.length >= 0) {
		line = '|      Conf files:';
		col = 0;
		workspaceStats.configFiles.forEach((item) => {
			appendAndWrap(item.name, item.count);
		});
		output.push(line);
	}

	return output.join('\n');
}

function formatLaunchConfigs(configs: WorkspaceStatItem[]): string {
	const output: string[] = [];
	let line = '|      Launch Configs:';
	configs.forEach(each => {
		const item = each.count > 1 ? ` ${each.name}(${each.count})` : ` ${each.name}`;
		line += item;
	});
	output.push(line);
	return output.join('\n');
}

function formatEnvironment(info: IMainProcessInfo): string {
	const MB = 1024 * 1024;
	const GB = 1024 * MB;

	const output: string[] = [];
	output.push(`Version:          ${pkg.name} ${pkg.version} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})`);
	output.push(`OS Version:       ${os.type()} ${os.arch()} ${os.release()})`);
	const cpus = os.cpus();
	if (cpus && cpus.length > 0) {
		output.push(`CPUs:             ${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`);
	}
	output.push(`Memory (System):  ${(os.totalmem() / GB).toFixed(2)}GB (${(os.freemem() / GB).toFixed(2)}GB free)`);
	if (!isWindows) {
		output.push(`Load (avg):       ${os.loadavg().map(l => Math.round(l)).join(', ')}`); // only provided on Linux/macOS
	}
	output.push(`VM:               ${Math.round((virtualMachineHint.value() * 100))}%`);
	output.push(`Screen Reader:    ${app.isAccessibilitySupportEnabled() ? 'yes' : 'no'}`);

	return output.join('\n');
}

function formatProcessList(info: IMainProcessInfo, rootProcess: ProcessItem): string {
	const mapPidToWindowTitle = new Map<number, string>();
	info.windows.forEach(window => mapPidToWindowTitle.set(window.pid, window.title));

	const output: string[] = [];

	output.push('CPU %\tMem MB\tProcess');

	formatProcessItem(mapPidToWindowTitle, output, rootProcess, 0);

	return output.join('\n');
}

function formatProcessItem(mapPidToWindowTitle: Map<number, string>, output: string[], item: ProcessItem, indent: number): void {
	const isRoot = (indent === 0);

	const MB = 1024 * 1024;

	// Format name with indent
	let name: string;
	if (isRoot) {
		name = `${product.applicationName} main`;
	} else {
		name = `${repeat('  ', indent)} ${item.name}`;

		if (item.name === 'window') {
			name = `${name} (${mapPidToWindowTitle.get(item.pid)})`;
		}
	}
	output.push(`${pad(Number(item.load.toFixed(0)), 5, ' ')}\t${pad(Number(((os.totalmem() * (item.mem / 100)) / MB).toFixed(0)), 6, ' ')}\t${name}`);

	// Recurse into children if any
	if (Array.isArray(item.children)) {
		item.children.forEach(child => formatProcessItem(mapPidToWindowTitle, output, child, indent + 1));
	}
}