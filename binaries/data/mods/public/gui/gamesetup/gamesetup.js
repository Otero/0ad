// Name displayed for unassigned player slots
const NAME_UNASSIGNED = "[color=\"90 90 90 255\"][unassigned]";

// Is this is a networked game, or offline
var g_IsNetworked;

// Is this user in control of game settings (i.e. is a network server, or offline player)
var g_IsController;

// Are we currently updating the GUI in response to network messages instead of user input
// (and therefore shouldn't send further messages to the network)
var g_IsInGuiUpdate;

var g_PlayerAssignments = {};

// Default game setup attributes
var g_GameAttributes = {
	mapType: "",
	map: "",
	mapPath: "",
	settings: {
		Size: 208,
		Seed: 0,
		BaseTerrain: "grass1_spring",
		BaseHeight: 0,
		PlayerData: [],
		RevealMap: false,
		LockTeams: false,
		GameType: "conquest"
	}
}

// Max number of players for any map
var g_MaxPlayers = g_ConfigDB.system["max_players"] || 8;

// Number of players for currently selected map
var g_NumPlayers = 0;

var g_ChatMessages = [];

// Data caches
var g_MapData = {};
var g_CivData = {};


function init(attribs)
{	
	switch (attribs.type) {
	case "offline":
		g_IsNetworked = false;
		g_IsController = true;
		break;
	case "server":
		g_IsNetworked = true;
		g_IsController = true;
		break;
	case "client":
		g_IsNetworked = true;
		g_IsController = false;
		break;
	default:
		error("Unexpected 'type' in gamesetup init: "+attribs.type);
	}
	
	// Get default player data - remove gaia
	var pDefs = initPlayerDefaults();
	pDefs.shift();
	
	// Build player settings using defaults
	g_GameAttributes.settings.PlayerData = pDefs;
	
	// Init civs
	initCivNameList();
	
	// Init map types
	var mapTypes = getGUIObjectByName("mapTypeSelection");
	mapTypes.list = ["Scenario"];	// TODO: May offer saved game type for multiplayer games?
	mapTypes.list_data = ["scenario"];
	
	// Setup controls for host only
	if (g_IsController)
	{
		// Set a default map
		// TODO: This could be remembered from the last session
		if (attribs.type == "offline")
			g_GameAttributes.map = "The Massacre of Delphi";
		else
			g_GameAttributes.map = "Gold_Rush";	
		
		mapTypes.selected = 0;
		
		initMapNameList();
		
		var numPlayers = getGUIObjectByName("numPlayersSelection");
		var players = [];
		for(var i = 1; i <= g_MaxPlayers; ++i)
			players.push(i);
		numPlayers.list = players;
		numPlayers.list_data = players;
		numPlayers.selected = g_MaxPlayers - 1;
		
		var victoryConditions = getGUIObjectByName("victoryCondition");
		victoryConditions.list = ["Conquest", "None"];
		victoryConditions.list_data = ["conquest", "endless"];
		victoryConditions.onSelectionChange = function()
		{
			if (this.selected != -1)
				g_GameAttributes.settings.GameType = this.list_data[this.selected];
			
			if(!g_IsInGuiUpdate)
				onGameAttributesChange();
		};
		victoryConditions.selected = -1;
		
		// From: http://trac.wildfiregames.com/wiki/List%3A_Maps%3A_Intro
		var mapSize = getGUIObjectByName("mapSize");
		mapSize.list = ["Small", "Medium", "Large", "Huge"];
		mapSize.list_data = [144, 176, 208, 272];
		mapSize.onSelectionChange = function()
		{
			if (this.selected != -1)
				g_GameAttributes.settings.Size = parseInt(this.list_data[this.selected]);
			
			if(!g_IsInGuiUpdate)
				onGameAttributesChange();
		};
		mapSize.selected = -1;
		
		getGUIObjectByName("revealMap").onPress = function()
		{	// Update attributes so other players can see change
			g_GameAttributes.settings.RevealMap = this.checked;
			
			if(!g_IsInGuiUpdate)
				onGameAttributesChange();
		};
		
		getGUIObjectByName("lockTeams").onPress = function()
		{	// Update attributes so other players can see change
			g_GameAttributes.settings.LockTeams = this.checked;
			
			if(!g_IsInGuiUpdate)
				onGameAttributesChange();
		};
	}
	else
	{
		// If we're a network client, disable all the map controls
		// TODO: make them look visually disabled so it's obvious why they don't work
		getGUIObjectByName("mapTypeSelection").enabled = false;
		getGUIObjectByName("mapSelection").enabled = false;
		
		// Disable player and game options controls
		// TODO: Shouldn't players be able to choose their own assignment?
		for (var i = 0; i < g_MaxPlayers; ++i)
			getGUIObjectByName("playerAssignment["+i+"]").enabled = false;
		
		getGUIObjectByName("numPlayersBox").hidden = true;
		
		// Disable "start game" button
		// TODO: Perhaps replace this with a "ready" button, and require host to wait?
		getGUIObjectByName("startGame").enabled = false;
	}
	

	// Set up offline-only bits:
	if (!g_IsNetworked)
	{
		getGUIObjectByName("chatPanel").hidden = true;

		g_PlayerAssignments = { "local": { "name": "You", "player": 1, "civ": "", "team": -1} };
	}
	
	
	// Settings for all possible player slots
	var boxSpacing = 32;
	for (var i = 0; i < g_MaxPlayers; ++i)
	{
		// Space player boxes
		var box = getGUIObjectByName("playerBox["+i+"]");
		var boxSize = box.size;
		var h = boxSize.bottom - boxSize.top;
		boxSize.top = i * boxSpacing;
		boxSize.bottom = i * boxSpacing + h;
		box.size = boxSize;
		
		// Populate team dropdowns
		var team = getGUIObjectByName("playerTeam["+i+"]");
		team.list = ["None", "1", "2", "3", "4"];
		team.list_data = [-1, 0, 1, 2, 3];
		team.selected = 0;
		
		let playerID = i;	// declare for inner function use
		team.onSelectionChange = function()
		{	// Update team
			if (this.selected != -1)
				g_GameAttributes.settings.PlayerData[playerID].Team = this.list_data[this.selected];
			
			if(!g_IsInGuiUpdate)
				onGameAttributesChange();
		};
		
		// Set events
		var civ = getGUIObjectByName("playerCiv["+i+"]");
		civ.onSelectionChange = function()
		{	// Update civ
			if (this.selected != -1)
				g_GameAttributes.settings.PlayerData[playerID].Civ = this.list_data[this.selected];
			
			if(!g_IsInGuiUpdate)
				onGameAttributesChange();
		};
	}

	updatePlayerList();

	getGUIObjectByName("chatInput").focus();
}

function cancelSetup()
{
	Engine.DisconnectNetworkGame();
}

function onTick()
{
	while (true)
	{
		var message = Engine.PollNetworkClient();
		if (!message)
			break;
		handleNetMessage(message);
	}
}

function handleNetMessage(message)
{
	log("Net message: "+uneval(message));

	switch (message.type) {
	case "netstatus":
		switch (message.status) {
		case "disconnected":
			Engine.DisconnectNetworkGame();
			Engine.PopGuiPage();
			reportDisconnect(message.reason);
			break;

		default:
			error("Unrecognised netstatus type "+message.status);
			break;
		}
		break;

	case "gamesetup":
		if (message.data) // (the host gets undefined data on first connect, so skip that)
			g_GameAttributes = message.data;

		onGameAttributesChange();
		break;

	case "players":
		// Find and report all joinings/leavings
		for (var host in message.hosts)
			if (! g_PlayerAssignments[host])
				addChatMessage({ "type": "connect", "username": message.hosts[host].name });
		for (var host in g_PlayerAssignments)
			if (! message.hosts[host])
				addChatMessage({ "type": "disconnect", "guid": host });
		// Update the player list
		g_PlayerAssignments = message.hosts;
		updatePlayerList();
		break;

	case "start":
		Engine.SwitchGuiPage("page_loading.xml", {
			"attribs": g_GameAttributes, 
			"isNetworked" : g_IsNetworked, 
			"playerAssignments": g_PlayerAssignments
		});
		break;

	case "chat":
		addChatMessage({ "type": "message", "guid": message.guid, "text": message.text });
		break;

	default:
		error("Unrecognised net message type "+message.type);
	}
}

// Get display name from map data
function getMapDisplayName(map)
{
	var mapData = loadMapData(map);
	
	if(!mapData || !mapData.settings || !mapData.settings.Name)
	{	// Give some msg that map format is unsupported
		log("Map data missing in scenario '"+map+"' - likely unsupported format");
		return map;
	}

	return mapData.settings.Name;
}

// Get a setting if it exists or return default
function getSetting(settings, defaults, property)
{
	if (settings && (property in settings))
		return settings[property];
	
	// Use defaults
	if (defaults && (property in defaults))
		return defaults[property];
	
	return undefined;
}

// Initialize the dropdowns containing all the available civs
function initCivNameList()
{
	// Cache civ data
	g_CivData = loadCivData();
	
	var civList = [ { "name": civ.Name, "code": civ.Code } for each (civ in g_CivData) ];

	// Alphabetically sort the list, ignoring case
	civList.sort(sortIgnoreCase);

	var civListNames = [ civ.name for each (civ in civList) ];
	var civListCodes = [ civ.code for each (civ in civList) ];

	// Update the dropdowns
	for (var i = 0; i < g_MaxPlayers; ++i)
	{
		var civ = getGUIObjectByName("playerCiv["+i+"]");
		civ.list = civListNames;
		civ.list_data = civListCodes;
		civ.selected = 0;
	}
}


// Initialise the list control containing all the available maps
function initMapNameList()
{
	// Get a list of map filenames
	// TODO: Should verify these are valid maps before adding to list
	var mapSelectionBox = getGUIObjectByName("mapSelection")
	var mapFiles;
	
	switch (g_GameAttributes.mapType) {
	case "scenario":
		mapFiles = getXMLFileList(g_GameAttributes.mapPath);
		break;

	case "random":
		mapFiles = getJSONFileList(g_GameAttributes.mapPath);
		break;
		
	default:
		error("initMapNameList: Unexpected map type '"+g_GameAttributes.mapType+"'");
		return;
	}

	// Cache map data
	for (var file in mapFiles)
		loadMapData(mapFiles[file]);

	var mapList = [ { "name": getMapDisplayName(file), "file": file } for each (file in mapFiles) ];

	// Alphabetically sort the list, ignoring case
	mapList.sort(sortIgnoreCase);

	var mapListNames = [ map.name for each (map in mapList) ];
	var mapListFiles = [ map.file for each (map in mapList) ];

	// Select the default map
	var selected = mapListFiles.indexOf(g_GameAttributes.map);
	// Default to the first element if we can't find the one we searched for
	if (selected == -1)
		selected = 0;

	// Update the list control
	mapSelectionBox.list = mapListNames;
	mapSelectionBox.list_data = mapListFiles;
	mapSelectionBox.selected = selected;
}

function loadMapData(name)
{
	if (!g_MapData[name])
	{
		switch(g_GameAttributes.mapType) {
		case "scenario":
			g_MapData[name] = Engine.LoadMapSettings(g_GameAttributes.mapPath+name);
			break;
			
		case "random":
			g_MapData[name] = parseJSONData(g_GameAttributes.mapPath+name+".json");
			break;
			
		default:
			error("loadMapData: Unexpected map type '"+g_GameAttributes.mapType+"'");
			return undefined;
		}
	}
	
	return g_MapData[name];
}

// Called when user selects number of players
function selectNumPlayers(num)
{
	// Avoid recursion
	if (g_IsInGuiUpdate)
		return;

	// Network clients can't change number of players
	if (g_IsNetworked && !g_IsController)
		return;
	
	// Only meaningful for random maps
	if (g_GameAttributes.mapType != "random")
		return;
	
	g_NumPlayers = num;
	
	if (g_IsNetworked)
		Engine.SetNetworkGameAttributes(g_GameAttributes);
	else 
		onGameAttributesChange();
}

// Called when the user selects a map type from the list
function selectMapType(type)
{
	// Avoid recursion
	if (g_IsInGuiUpdate)
		return;

	// Network clients can't change map type
	if (g_IsNetworked && !g_IsController)
		return;

	g_GameAttributes.mapType = type;
	
	// Clear old map data
	g_MapData = {};
	
	// Select correct path
	switch (g_GameAttributes.mapType) {
	case "scenario":
		g_GameAttributes.mapPath = "maps/scenarios/";
		break;
		
	case "random":
		g_GameAttributes.mapPath = "maps/random/";
		break;
		
	default:
		error("selectMapType: Unexpected map type '"+g_GameAttributes.mapType+"'");
		return;
	}

	initMapNameList();

	if (g_IsNetworked)
		Engine.SetNetworkGameAttributes(g_GameAttributes);
	else
		onGameAttributesChange();
}

// Called when the user selects a map from the list
function selectMap(name)
{
	// Avoid recursion
	if (g_IsInGuiUpdate)
		return;

	// Network clients can't change map
	if (g_IsNetworked && !g_IsController)
		return;

	g_GameAttributes.map = name;

	var mapData = loadMapData(name);
	var mapSettings = (mapData && mapData.settings ? mapData.settings : {});
	
	// Load map type specific settings (so we can overwrite them in the GUI)
	switch (g_GameAttributes.mapType) {
	case "scenario":
		g_NumPlayers = (mapSettings.PlayerData ? mapSettings.PlayerData.length : g_MaxPlayers);
		break;
		
	case "random":
		// Copy any new settings
		if (mapSettings.PlayerData)
			g_NumPlayers = mapSettings.PlayerData.length;
		
		g_GameAttributes.settings.Size = getSetting(mapSettings, g_GameAttributes.settings, "Size");
		g_GameAttributes.settings.BaseTerrain = getSetting(mapSettings, g_GameAttributes.settings, "BaseTerrain");
		g_GameAttributes.settings.BaseHeight = getSetting(mapSettings, g_GameAttributes.settings, "BaseHeight");
		g_GameAttributes.settings.RevealMap = getSetting(mapSettings, g_GameAttributes.settings, "RevealMap");
		g_GameAttributes.settings.GameType = getSetting(mapSettings, g_GameAttributes.settings, "GameType");
		break;
		
	default:
		error("selectMap: Unexpected map type '"+g_GameAttributes.mapType+"'");
		return;
	}
	
	if (g_IsNetworked)
		Engine.SetNetworkGameAttributes(g_GameAttributes);
	else
		onGameAttributesChange();
}

function onGameAttributesChange()
{
	g_IsInGuiUpdate = true;
	
	var mapName = g_GameAttributes.map || "";
	var mapData = loadMapData(mapName);
	var mapSettings = (mapData && mapData.settings ? mapData.settings : {});
		
	// Update some controls for clients
	if (!g_IsController)
	{
		var mapTypeSelectionBox = getGUIObjectByName("mapTypeSelection");
		var mapTypeIdx = mapTypeSelectionBox.list_data.indexOf(g_GameAttributes.mapType);
		mapTypeSelectionBox.selected = mapTypeIdx;
		var mapSelectionBox = getGUIObjectByName("mapSelection");
		var mapIdx = mapSelectionBox.list_data.indexOf(mapName);
		mapSelectionBox.selected = mapIdx;
		
		initMapNameList();
		
		g_NumPlayers = (mapSettings.PlayerData ? mapSettings.PlayerData.length : g_MaxPlayers);
	}
	
	// Controls common to all map types
	var revealMap = getGUIObjectByName("revealMap");
	var victoryCondition = getGUIObjectByName("victoryCondition");
	var lockTeams = getGUIObjectByName("lockTeams");
	var mapSize = getGUIObjectByName("mapSize");
	var revealMapText = getGUIObjectByName("revealMapText");
	var victoryConditionText = getGUIObjectByName("victoryConditionText");
	var lockTeamsText = getGUIObjectByName("lockTeamsText");
	var mapSizeText = getGUIObjectByName("mapSizeText");
	var numPlayersBox = getGUIObjectByName("numPlayersBox");
		
	// Handle map type specific logic
	switch (g_GameAttributes.mapType) {
	case "random":
		
		g_GameAttributes.script = mapSettings.Script;
		var sizeIdx = mapSize.list_data.indexOf(g_GameAttributes.settings.Size.toString());
		
		// Show options for host/controller
		if (g_IsController)
		{
			numPlayersBox.hidden = false;
			mapSize.hidden = false;
			revealMap.hidden = false;
			victoryCondition.hidden = false;
			lockTeams.hidden = false;
			
			mapSizeText.caption = "Map size:";
			mapSize.selected = sizeIdx;
			revealMapText.caption = "Reveal map:";
			revealMap.checked = g_GameAttributes.settings.RevealMap ? true : false;
			victoryConditionText.caption = "Victory condition:";
			victoryCondition.selected = victoryCondition.list_data.indexOf(g_GameAttributes.settings.GameType);
			lockTeamsText.caption = "Teams locked:";
			lockTeams.checked =  g_GameAttributes.settings.LockTeams ? true : false;
		}
		else
		{
			mapSizeText.caption = "Map size: " + (mapSize.list[sizeIdx] !== undefined ? mapSize.list[sizeIdx] : "n/a");
			revealMapText.caption = "Reveal map: " + (g_GameAttributes.settings.RevealMap ? "Yes" : "No");
			victoryConditionText.caption = "Victory condition: " + (g_GameAttributes.settings.GameType && g_GameAttributes.settings.GameType == "endless"  ?  "None" : "Conquest");
			lockTeamsText.caption = "Teams locked: " + (g_GameAttributes.settings.LockTeams ? "Yes" : "No");
		}
		
		break;
	
	case "saved":
	case "scenario":
		// For scenario just reflect settings for the current map
		numPlayersBox.hidden = true;
		mapSize.hidden = true;
		revealMap.hidden = true;
		victoryCondition.hidden = true;
		lockTeams.hidden = true;
		
		mapSizeText.caption = "Map size: n/a";
		revealMapText.caption = "Reveal map: " + (mapSettings.RevealMap ? "Yes" : "No");
		victoryConditionText.caption = "Victory condition: " + (mapSettings.GameType && mapSettings.GameType == "endless"  ?  "None" : "Conquest");
		lockTeamsText.caption = "Teams locked: " + (mapSettings.LockTeams ? "Yes" : "No");
		
		break;
		
	default:
		error("onGameAttributesChange: Unexpected map type '"+g_GameAttributes.mapType+"'");
		return;
	}
	
	// Display map name
	getGUIObjectByName("mapInfoName").caption = getMapDisplayName(mapName);

	// Load the description from the map file, if there is one
	var description = mapSettings.Description || "Sorry, no description available.";
		
	// Describe the number of players
	var playerString = g_NumPlayers + " " + (g_NumPlayers == 1 ? "player" : "players") + ". ";
	
	
	for (var i = 0; i < g_MaxPlayers; ++i)
	{
		// Show only needed player slots
		getGUIObjectByName("playerBox["+i+"]").hidden = (i >= g_NumPlayers);
		
		// Show player data or defaults as necessary
		if (i < g_NumPlayers)
		{
			var pName = getGUIObjectByName("playerName["+i+"]");
			var pCiv = getGUIObjectByName("playerCiv["+i+"]");
			var pCivText = getGUIObjectByName("playerCivText["+i+"]");
			var pTeam = getGUIObjectByName("playerTeam["+i+"]");
			var pTeamText = getGUIObjectByName("playerTeamText["+i+"]");
			var pColor = getGUIObjectByName("playerColour["+i+"]");
			
			// Player data / defaults
			var pData = mapSettings.PlayerData ? mapSettings.PlayerData[i] : {};
			var pDefs = g_GameAttributes.settings.PlayerData ? g_GameAttributes.settings.PlayerData[i] : {};
			
			// Common to all game types
			var color = iColorToString(getSetting(pData, pDefs, "Colour"));
			pColor.sprite = "colour:"+color+" 100";
			pName.caption =  getSetting(pData, pDefs, "Name");
			
			var team = getSetting(pData, pDefs, "Team");
			var civ = getSetting(pData, pDefs, "Civ");
				
			if (g_GameAttributes.mapType == "scenario")
			{	
				// TODO: If scenario settings can be changed, handle that (using dropdowns rather than textboxes)
				pCivText.caption = g_CivData[civ].Name;
				pTeamText.caption = (team && team > 0) ? pData.Team : "-";
				pCivText.hidden = false;
				pCiv.hidden = true;
				pTeamText.hidden = false;
				pTeam.hidden = true;
			}
			else if (g_GameAttributes.mapType == "random")
			{
				pCivText.hidden = true;
				pCiv.hidden = false;
				pTeamText.hidden = true;
				pTeam.hidden = false;
				
				// Set dropdown values
				pCiv.selected = (civ ? pCiv.list_data.indexOf(civ) : 0);
				pTeam.selected = (team ? pTeam.list_data.indexOf(team) : 0);
			}
		}
	}

	getGUIObjectByName("mapInfoDescription").caption = playerString + description;
	
	g_IsInGuiUpdate = false;
}

function launchGame()
{
	if (g_IsNetworked && !g_IsController)
	{
		error("Only host can start game");
		return;
	}
	
	// TODO: Generate seed here for random maps

	if (g_IsNetworked)
	{
		Engine.SetNetworkGameAttributes(g_GameAttributes);
		Engine.StartNetworkGame();
	}
	else
	{
		// Find the player ID which the user has been assigned to
		var playerID = -1;
		for (var i = 0; i < g_NumPlayers; ++i)
		{
			var assignBox = getGUIObjectByName("playerAssignment["+i+"]");
			if (assignBox.selected == 1)
				playerID = i+1;
		}
		// Remove extra player data
		g_GameAttributes.settings.PlayerData = g_GameAttributes.settings.PlayerData.slice(0, g_NumPlayers);
		
		Engine.StartGame(g_GameAttributes, playerID);
		Engine.SwitchGuiPage("page_loading.xml", {
			"attribs": g_GameAttributes, 
			"isNetworked" : g_IsNetworked, 
			"playerAssignments": g_PlayerAssignments
		});
	}
}

function updatePlayerList()
{
	g_IsInGuiUpdate = true;

	var hostNameList = [NAME_UNASSIGNED];
	var hostGuidList = [""];
	var assignments = [];
	
	for (var guid in g_PlayerAssignments)
	{
		var name = g_PlayerAssignments[guid].name;
		var hostID = hostNameList.length;
		var player = g_PlayerAssignments[guid].player;
		
		hostNameList.push(name);
		hostGuidList.push(guid);
		assignments[player] = hostID;
	}

	for (var i = 0; i < g_MaxPlayers; ++i)
	{
		var assignBox = getGUIObjectByName("playerAssignment["+i+"]");
		assignBox.list = hostNameList;
		var selection = (assignments[i+1] || 0);
		if (assignBox.selected != selection)
			assignBox.selected = selection;

		let playerID = i+1;
		if (g_IsNetworked && g_IsController)
		{
			assignBox.onselectionchange = function ()
			{
				if (!g_IsInGuiUpdate)
					Engine.AssignNetworkPlayer(playerID, hostGuidList[this.selected]);
			};
		}
		else if (!g_IsNetworked)
		{
			assignBox.onselectionchange = function ()
			{
				if (!g_IsInGuiUpdate)
				{
					// If we didn't just select "unassigned", update the selected host's ID
					if (this.selected > 0)
						g_PlayerAssignments[hostGuidList[this.selected]].player = playerID;

					updatePlayerList();
				}
			};
		}
	}

	g_IsInGuiUpdate = false;
}

function submitChatInput()
{
	var input = getGUIObjectByName("chatInput");
	var text = input.caption;
	if (text.length)
	{
		Engine.SendNetworkChat(text);
		input.caption = "";
	}
}

function addChatMessage(msg)
{
	var username = escapeText(msg.username || g_PlayerAssignments[msg.guid].name);
	var message = escapeText(msg.text);
	
	// TODO: Maybe host should have distinct font/color?
	var color = "0 0 0";
	
	if (g_PlayerAssignments[msg.guid] && g_PlayerAssignments[msg.guid].player != 255)
	{	// Valid player who has been assigned - get player colour
		var player = g_PlayerAssignments[msg.guid].player - 1;
		var mapName = g_GameAttributes.map;
		var mapData = loadMapData(mapName);
		var mapSettings = (mapData && mapData.settings ? mapData.settings : {});
		var pData = mapSettings.PlayerData ? mapSettings.PlayerData[player] : {};
		var pDefs = g_GameAttributes.settings.PlayerData ? g_GameAttributes.settings.PlayerData[player] : {};
		
		color = iColorToString(getSetting(pData, pDefs, "Colour"));
	}
	
	var formatted;
	switch (msg.type) {
	case "connect":
		formatted = '[font="serif-bold-13"][color="'+ color +'"]' + username + '[/color][/font] [color="64 64 64"]has joined[/color]';
		break;

	case "disconnect":
		formatted = '[font="serif-bold-13"][color="'+ color +'"]' + username + '[/color][/font] [color="64 64 64"]has left[/color]';
		break;

	case "message":
		formatted = '[font="serif-bold-13"]<[color="'+ color +'"]' + username + '[/color]>[/font] ' + message;
		break;

	default:
		error("Invalid chat message '" + uneval(msg) + "'");
		return;
	}

	g_ChatMessages.push(formatted);

	getGUIObjectByName("chatText").caption = g_ChatMessages.join("\n");
}
