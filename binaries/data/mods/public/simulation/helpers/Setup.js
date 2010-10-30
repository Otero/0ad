
/**
 * Used to initialize non-player settings relevant to the map, like
 * default stance and victory conditions. DO NOT load players here
 */
function LoadMapSettings(settings)
{
	// Default settings
	if (!settings)
		settings = {};
	
	
	if (settings.DefaultStance)
	{
		for each (var ent in Engine.GetEntitiesWithInterface(IID_UnitAI))
		{
			var cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
			cmpUnitAI.SetStance(settings.DefaultStance);
		}
	}

	if (settings.RevealMap)
	{
		var cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
		if (cmpRangeManager)
			cmpRangeManager.SetLosRevealAll(true);
	}

	if (settings.CircularMap)
	{
		var cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
		if (cmpRangeManager)
			cmpRangeManager.SetLosCircular(true);
	}

	var cmpEndGameManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_EndGameManager);
	if (settings.GameType)
	{
		cmpEndGameManager.SetGameType(settings.GameType);
	}
	cmpEndGameManager.Start();
}

Engine.RegisterGlobal("LoadMapSettings", LoadMapSettings);